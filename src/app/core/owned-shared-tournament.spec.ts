import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage';
import { namedPlayers, tournamentState } from '../testing/tournament-state';
import { CurrentTournament } from './current-tournament';
import { OwnedSharedTournament } from './owned-shared-tournament';
import type { SharedTournamentSnapshot } from './models';
import { ANALYTICS } from './ports/analytics.port';
import { AUTH } from './ports/auth.port';
import { CLOCK } from './ports/clock.port';
import { LOCAL_STORE, SESSION_STORE } from './ports/key-value-store.port';
import { TOURNAMENT_FEED } from './ports/live-feed.port';
import { FakeAnalytics } from './ports/testing/analytics.fake';
import { FakeAuth } from './ports/testing/auth.fake';
import { FakeClock } from './ports/testing/clock.fake';
import { FakeTournamentFeed } from './ports/testing/feed.fake';
import { FakeSharedTournaments } from './ports/testing/shared-tournaments.fake';
import { SHARED_TOURNAMENTS } from './ports/tournaments.port';
import { URL_STATE } from './routing/url-state';

const snapshot = (overrides: Partial<SharedTournamentSnapshot> = {}): SharedTournamentSnapshot => ({
  id: 'shared-1',
  status: 'registration',
  capacity: 8,
  state: tournamentState({
    hostingMode: 'shared',
    sharedTournamentId: 'shared-1',
    sharedStatus: 'registration',
    players: [{ id: 'm', name: 'Moderadora' }],
  }),
  inviteToken: 'invite-1',
  inviteExpiresAt: '2099-01-01T00:00:00Z',
  expiresAt: null,
  ...overrides,
});

function setup() {
  const fakes = {
    auth: new FakeAuth(),
    shared: new FakeSharedTournaments(),
    feed: new FakeTournamentFeed(),
    analytics: new FakeAnalytics(),
    local: new MemoryStorage(),
    session: new MemoryStorage(),
  };
  fakes.analytics.start();
  TestBed.configureTestingModule({
    providers: [
      { provide: AUTH, useValue: fakes.auth },
      { provide: SHARED_TOURNAMENTS, useValue: fakes.shared },
      { provide: TOURNAMENT_FEED, useValue: fakes.feed },
      { provide: ANALYTICS, useValue: fakes.analytics },
      { provide: LOCAL_STORE, useValue: fakes.local },
      { provide: SESSION_STORE, useValue: fakes.session },
      { provide: CLOCK, useValue: new FakeClock() },
      { provide: URL_STATE, useValue: { inviteUrl: (token: string) => `https://app.test/?invite=${token}` } },
    ],
  });
  const owned = TestBed.inject(OwnedSharedTournament);
  const tournament = TestBed.inject(CurrentTournament);
  const hooks = { save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() };
  tournament.connect(hooks);
  const applied = vi.fn();
  owned.connect({ applied });
  return { ...fakes, owned, tournament, hooks, applied };
}

const moderator = { name: ' Moderadora ', gender: 'female' as const, avatar: '' };
const draft = () => tournamentState({ name: 'Sábado', hostingMode: 'shared', players: namedPlayers(2) });

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => vi.restoreAllMocks());

describe('creating the shared tournament', () => {
  it('signs in without an e-mail when nobody is signed in, creates it empty and makes it current', async () => {
    const { owned, tournament, auth, shared, hooks, applied, analytics, local, feed } = setup();
    local.setItem('setpoint.shared.setup', 'old');
    expect(await owned.create(draft(), moderator)).toBe(true);
    expect(await auth.currentUser()).toEqual({ id: 'anonymous-user' });
    const [call] = shared.calls.filter((item) => item.method === 'createSharedTournament');
    expect(call.args[0]).toMatchObject({
      hostingMode: 'shared',
      players: [],
      rounds: [],
      fixedPairs: [],
      finals: null,
    });
    expect(call.args.slice(1, 3)).toEqual(['Moderadora', 'female']);
    expect(owned.moderator()).toBe(true);
    expect(owned.inviteToken()).toBe('invite-1');
    expect(owned.inviteUrl()).toBe('https://app.test/?invite=invite-1');
    expect(owned.notice()).toBe('created');
    expect(owned.loading()).toBe(false);
    expect(tournament.state().sharedTournamentId).toBe('shared-1');
    expect(applied).toHaveBeenCalledWith(expect.objectContaining({ id: 'shared-1' }), false);
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(local.getItem('setpoint.shared.ownerInvite.shared-1')).toBe('invite-1');
    expect(local.getItem('setpoint.shared.setup')).toBeNull();
    expect(feed.watching()).toEqual(['shared:shared-1']);
    expect(analytics.calls.map((item) => (item.kind === 'capture' ? item.event : item.kind))).toEqual([
      'tournament_created',
      'shared_tournament_created',
    ]);
  });

  it('reuses a signed-in session', async () => {
    const { owned, auth } = setup();
    await auth.signInAnonymously();
    const spy = vi.spyOn(auth, 'signInAnonymously');
    expect(await owned.create(draft(), moderator)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('says when anonymous sign-in is off, and leaves nothing half done', async () => {
    const { owned, auth, shared, feed } = setup();
    vi.spyOn(auth, 'signInAnonymously').mockRejectedValue(new Error('Anonymous sign-ins are disabled'));
    expect(await owned.create(draft(), moderator)).toBe(false);
    expect(owned.error()).toEqual({ key: 'anonymousDisabled' });
    expect(owned.moderator()).toBe(false);
    expect(shared.calls).toEqual([]);
    expect(feed.watching()).toEqual([]);
    expect(owned.loading()).toBe(false);
  });

  it('turns a server refusal into an error key', async () => {
    const { owned, shared } = setup();
    shared.fail('authentication_required');
    expect(await owned.create(draft(), moderator)).toBe(false);
    expect(owned.error()).toEqual({ key: 'authRequired' });
    expect(owned.moderator()).toBe(false);
  });
});

describe('the owned tournament after a reload', () => {
  it('restores it, keeping the saved invite and watching it', async () => {
    const { owned, shared, local, tournament, feed, applied } = setup();
    shared.givenOwned(snapshot());
    local.setItem('setpoint.shared.ownerInvite.shared-1', 'saved-invite');
    expect(await owned.restore('shared-1', false)).toMatchObject({ id: 'shared-1' });
    expect(owned.moderator()).toBe(true);
    expect(owned.inviteToken()).toBe('saved-invite');
    expect(tournament.state().sharedTournamentId).toBe('shared-1');
    expect(applied).toHaveBeenCalledOnce();
    expect(feed.watching()).toEqual(['shared:shared-1']);
  });

  it('keeps the local copy current when this device still has changes to send', async () => {
    const { owned, shared, tournament, applied } = setup();
    shared.givenOwned(snapshot());
    const local = tournamentState({ name: 'Local' });
    tournament.set(local);
    await owned.restore('shared-1', true);
    expect(tournament.state()).toBe(local);
    expect(owned.snapshot()?.id).toBe('shared-1');
    expect(applied).not.toHaveBeenCalled();
  });

  it('reports an error and does not become moderator when the read fails', async () => {
    const { owned, shared } = setup();
    shared.givenOwned(snapshot());
    shared.fail('tournament_expired');
    expect(await owned.restore('shared-1', false)).toBeNull();
    expect(owned.error()).toEqual({ key: 'expired' });
    expect(owned.moderator()).toBe(false);
  });
});

describe('keeping it up to date', () => {
  it('a realtime notice reads the tournament again and keeps the view', async () => {
    const { owned, shared, feed, tournament, applied } = setup();
    shared.givenOwned(snapshot());
    await owned.restore('shared-1', false);
    applied.mockClear();
    await shared.addSharedParticipant('shared-1', 'Convidada', 'female');
    feed.trigger('shared', 'shared-1');
    await vi.waitFor(() => expect(tournament.state().players).toHaveLength(2));
    expect(applied).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('does nothing when nothing changed, and leaves a started tournament alone', async () => {
    const { owned, shared, tournament, applied } = setup();
    shared.givenOwned(snapshot());
    await owned.restore('shared-1', false);
    applied.mockClear();
    await owned.refresh('shared-1');
    expect(applied).not.toHaveBeenCalled();
    await shared.addSharedParticipant('shared-1', 'Convidada', 'female');
    tournament.update((state) => ({
      ...state,
      rounds: [{ number: 1, matches: [], restingPlayerIds: [] }],
    }));
    await owned.refresh('shared-1');
    expect(applied).not.toHaveBeenCalled();
  });

  it('an error while refreshing is shown', async () => {
    const { owned, shared } = setup();
    shared.givenOwned(snapshot());
    await owned.restore('shared-1', false);
    shared.fail('tournament_expired');
    await owned.refresh('shared-1');
    expect(owned.error()).toEqual({ key: 'expired' });
  });
});

describe('the moderator at work', () => {
  async function created() {
    const context = setup();
    await context.owned.create(draft(), moderator);
    context.owned.clearMessages();
    return context;
  }

  it('adds a participant without a phone and keeps the view', async () => {
    const { owned, tournament, applied, analytics } = await created();
    applied.mockClear();
    expect(await owned.addParticipant({ name: ' Sem celular ', gender: '', avatar: '' })).toBe(true);
    expect(tournament.state().players.map((player) => player.name)).toContain('Sem celular');
    expect(applied).toHaveBeenCalledWith(expect.anything(), true);
    expect(analytics.calls.at(-1)).toMatchObject({ event: 'shared_participant_added_manually' });
  });

  it('removes a manual participant and refuses another', async () => {
    const { owned, tournament } = await created();
    await owned.addParticipant({ name: 'Sem celular', gender: '', avatar: '' });
    const manual = tournament.state().players.find((player) => player.manual)!;
    expect(await owned.removeParticipant(manual.id)).toBe(true);
    expect(tournament.state().players.some((player) => player.manual)).toBe(false);
    expect(await owned.removeParticipant('m')).toBe(false);
    expect(owned.error()).toEqual({ key: 'notRemovable' });
  });

  it('shows the error when the tournament is full', async () => {
    const { owned, shared } = await created();
    shared.fail('tournament_full');
    expect(await owned.addParticipant({ name: 'X', gender: '', avatar: '' })).toBe(false);
    expect(owned.error()).toEqual({ key: 'full' });
  });

  it('a new invite replaces the old one in the state and in the storage', async () => {
    const { owned, local } = await created();
    expect(await owned.renewInvite()).toBe(true);
    expect(owned.inviteToken()).toBe('invite-rotated-1');
    expect(local.getItem('setpoint.shared.ownerInvite.shared-1')).toBe('invite-rotated-1');
    expect(owned.notice()).toBe('renewed');
  });

  it('copies the invite link, or says it could not', async () => {
    const { owned, analytics } = await created();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await owned.copyInvite();
    expect(writeText).toHaveBeenCalledWith('https://app.test/?invite=invite-1');
    expect(owned.notice()).toBe('copied');
    expect(analytics.calls.at(-1)).toMatchObject({ event: 'shared_invite_copied' });
    writeText.mockRejectedValue(new Error('denied'));
    await owned.copyInvite();
    expect(owned.error()).toEqual({ key: 'copyFailed' });
  });

  it('cancels on the server, and reports a refusal', async () => {
    const { owned, shared } = await created();
    expect(await owned.cancel('shared-1')).toBe(true);
    shared.fail('tournament_completed');
    expect(await owned.cancel('shared-1')).toBe(false);
    expect(owned.error()).toEqual({ key: 'completed' });
  });

  it('leaving stops the watch and forgets the moderator, the invite and the messages', async () => {
    const { owned, feed, local } = await created();
    owned.fail({ key: 'full' });
    owned.leave();
    expect(feed.watching()).toEqual([]);
    expect(owned.moderator()).toBe(false);
    expect(owned.snapshot()).toBeNull();
    expect(owned.inviteToken()).toBe('');
    expect(owned.error()).toBeNull();
    expect(local.getItem('setpoint.shared.ownerInvite.shared-1')).toBeNull();
  });
});
