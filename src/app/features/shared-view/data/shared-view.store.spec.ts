import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalLiveTournamentSnapshot, TournamentState } from '../../../core/models';
import { CLOCK } from '../../../core/ports/clock.port';
import type { FakeClock } from '../../../core/ports/testing/clock.fake';
import { MemoryStorage } from '../../../testing/memory-storage';
import { storedTournament, tournamentState } from '../../../testing/tournament-state';
import { ProjectionController } from '../../tournament/projection/projection-controller';
import { sharedSnapshot, type SharedViewFakeOptions, sharedViewFakes } from '../shared-view.fakes';
import { POLL_MS, SharedViewStore } from './shared-view.store';

const INVITE = 'invite-token';
const LIVE = 'live-token';
const shared = sharedSnapshot;

/** The stored fixture (a Super 8 in progress) with round 1 played and the projection on. */
function projectionState(): TournamentState {
  const state = storedTournament();
  Object.assign(state.rounds[0].matches[1], { scoreA: 4, scoreB: 1 });
  return { ...state, hostingMode: 'shared', qualificationStats: true };
}

/** The same state with the next unplayed match scored. */
function oneMoreScore(state: TournamentState): TournamentState {
  const next = structuredClone(state);
  const match = next.rounds.flatMap((round) => round.matches).find((candidate) => candidate.scoreA === null);
  if (match) Object.assign(match, { scoreA: 4, scoreB: 3 });
  return next;
}

function setup(options: SharedViewFakeOptions) {
  const fakes = sharedViewFakes(options);
  TestBed.configureTestingModule({ providers: [SharedViewStore, ProjectionController, ...fakes.providers] });
  const start = async () => {
    const store = TestBed.inject(SharedViewStore);
    await vi.advanceTimersByTimeAsync(0);
    return store;
  };
  const events = () => fakes.analytics.calls.flatMap((call) => (call.kind === 'capture' ? [call.event] : []));
  return { ...fakes, sharedRepo: fakes.shared, start, events };
}

describe('SharedViewStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  describe('invite', () => {
    it('shows nothing until the tournament arrives, then offers to join with the profile name', async () => {
      const local = new MemoryStorage();
      local.setItem('setpoint.profile.v1', JSON.stringify({ name: 'Bia', autoJoin: true, gender: 'female' }));
      const { sharedRepo, start, feed } = setup({ url: { inviteToken: INVITE }, local });
      sharedRepo.given(INVITE, shared());
      const store = TestBed.inject(SharedViewStore);
      expect(store.mode).toBe('invite');
      expect(store.tournament()).toBeNull();
      expect(store.arena()).toBeNull();

      await start();

      expect(store.tournament()?.name).toBe('Compartilhado');
      expect(store.tournament()?.hostingMode).toBe('shared');
      expect(store.canJoin()).toBe(true);
      expect(store.guestName()).toBe('Bia');
      expect(store.guestGender()).toBe('female');
      expect(store.joined()).toBe(false);
      expect(feed.watching()).toEqual(['shared:shared-1']);
      expect(store.versionLabel).toBe('v42');
    });

    it('a guest who joined before is joined again with the same name', async () => {
      const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.given(INVITE, shared());
      await sharedRepo.joinSharedTournament(INVITE, 'Caio');

      const store = await start();

      expect(store.joined()).toBe(true);
      expect(store.guestName()).toBe('Caio');
      expect(store.canJoin()).toBe(false);
      expect(store.guestPlayerId()).not.toBe('');
      expect(sharedRepo.calls.map((call) => call.method)).toEqual([
        'joinSharedTournament',
        'getGuestName',
        'getSharedTournament',
        'joinSharedTournament',
      ]);
    });

    it('joins, finds the guest in the roster and records the join', async () => {
      const { sharedRepo, start, analytics } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.given(INVITE, shared());
      const store = await start();
      store.guestName.set('  Duda ');

      await store.join();

      expect(store.joined()).toBe(true);
      expect(store.guestName()).toBe('Duda');
      expect(store.tournament()?.players.map((player) => player.name)).toEqual(['Moderadora', 'Duda']);
      expect(store.guestPlayerId()).toBe('guest-2');
      expect(store.loading()).toBe(false);
      expect(analytics.calls).toContainEqual({
        kind: 'capture',
        event: 'shared_tournament_joined',
        properties: { tournament_mode: 'super', doubles_format: 'open', tournament_size: 8, participant_count: 2 },
      });
    });

    it('asks for the category before joining a mixed tournament', async () => {
      const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.given(INVITE, shared({ state: tournamentState({ doublesFormat: 'mixed', players: [] }) }));
      const store = await start();
      store.guestName.set('Edu');

      await store.join();

      expect(store.error()).toEqual({ key: 'chooseCategory' });
      expect(store.joined()).toBe(false);
    });

    it('does nothing without a name', async () => {
      const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.given(INVITE, shared());
      const store = await start();
      store.guestName.set('  ');
      await store.join();
      expect(sharedRepo.calls.filter((call) => call.method === 'joinSharedTournament')).toEqual([]);
    });

    for (const [code, key] of [
      ['invite_expired', 'inviteExpired'],
      ['registration_closed', 'inviteExpired'],
      ['invalid_invite', 'invalidInvite'],
      ['tournament_expired', 'expired'],
      ['tournament_completed', 'completed'],
      ['authentication_required', 'authentication'],
    ] as const) {
      it(`says why the invite failed (${code})`, async () => {
        const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
        sharedRepo.given(INVITE, shared());
        sharedRepo.fail(code);
        const store = await start();
        expect(store.error()).toEqual({ key });
        expect(store.tournament()).toBeNull();
      });
    }

    it('a full tournament refuses the join', async () => {
      const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.given(INVITE, shared());
      const store = await start();
      sharedRepo.fail('tournament_full');
      store.guestName.set('Atrasado');
      await store.join();
      expect(store.error()).toEqual({ key: 'full' });
      expect(store.joined()).toBe(false);
    });

    it('an unknown failure keeps the server message', async () => {
      const { sharedRepo, start } = setup({ url: { inviteToken: INVITE } });
      sharedRepo.fail('something odd');
      const store = await start();
      expect(store.error()).toEqual({ key: 'unknown', detail: 'something odd' });
    });

    it('says shared mode is not configured on this deploy', async () => {
      const store = await setup({ url: { inviteToken: INVITE }, configured: false }).start();
      expect(store.error()).toEqual({ key: 'sharedNotConfigured' });
    });

    it('asks for feedback once when the tournament it follows ends', async () => {
      const { sharedRepo, start, surveys } = setup({ url: { inviteToken: INVITE } });
      const state = projectionState();
      sharedRepo.given(INVITE, shared({ status: 'active', state }));
      await start();

      sharedRepo.given(
        INVITE,
        shared({ status: 'completed', state: { ...state, finishedAt: '2026-11-13T12:00:00Z' } }),
      );
      await vi.advanceTimersByTimeAsync(POLL_MS);
      await vi.advanceTimersByTimeAsync(1);

      expect(surveys.shown).toEqual(['Net promoter score (NPS) (2026-11-01 20:44)']);
    });
  });

  describe('live link', () => {
    function liveSnapshot(overrides: Partial<LocalLiveTournamentSnapshot> = {}): LocalLiveTournamentSnapshot {
      return { id: 'live-1', status: 'active', state: { ...storedTournament(), name: 'Ao vivo' }, ...overrides };
    }

    // The bug this guards against (the device's own live token replacing the link's) lived in AppComponent's startup;
    // e2e/shared-view.spec.ts covers it end to end. Here: the store reads with the link's token and nothing else.
    it("reads with the link's token, whatever this device has stored", async () => {
      const local = new MemoryStorage();
      local.setItem('setpoint.tournament.v1', JSON.stringify({ ...storedTournament(), analyticsId: 'mine' }));
      local.setItem('setpoint.local.live.mine', JSON.stringify({ id: 'own', readToken: 'own-token', writeToken: 'w' }));
      const { live, start, feed } = setup({ url: { liveToken: LIVE }, local });
      live.given(LIVE, liveSnapshot());
      live.given('own-token', liveSnapshot({ id: 'own', state: storedTournament() }));

      const store = await start();
      await vi.advanceTimersByTimeAsync(POLL_MS);

      expect(store.mode).toBe('live');
      expect(store.tournament()?.name).toBe('Ao vivo');
      expect(store.tournament()?.hostingMode).toBe('local');
      expect(new Set(live.reads)).toEqual(new Set([LIVE]));
      expect(feed.watching()).toEqual(['local:live-1']);
    });

    it('is waiting for the start while there is no schedule', async () => {
      const { live, start } = setup({ url: { liveToken: LIVE } });
      live.given(LIVE, liveSnapshot({ state: tournamentState({ hostingMode: 'local' }) }));
      const store = await start();
      expect(store.status()).toBe('registration');
      expect(store.arena()).toMatchObject({ kicker: 'live', badge: 'soon', status: 'waiting', live: false });
      expect(store.canJoin()).toBe(false);
    });

    it('describes a running and a finished tournament', async () => {
      const { live, start } = setup({ url: { liveToken: LIVE } });
      live.given(LIVE, liveSnapshot());
      const store = await start();
      expect(store.arena()).toMatchObject({
        name: 'Ao vivo',
        groups: false,
        kicker: 'live',
        badge: 'live',
        status: 'following',
        live: true,
        completedMatches: 1,
        totalMatches: 14,
        players: 8,
        phase: 'qualifying',
      });
      expect(store.arena()?.elapsed).not.toBeNull();

      live.given(LIVE, liveSnapshot({ status: 'completed', state: { ...storedTournament(), finishedAt: 'x' } }));
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(store.arena()).toMatchObject({ badge: 'finished', status: 'finished', live: false, phase: 'finished' });
    });

    it('an invalid link says so', async () => {
      const store = await setup({ url: { liveToken: 'wrong' } }).start();
      expect(store.error()).toEqual({ key: 'invalidLiveLink' });
    });

    it('says live links are not configured on this deploy', async () => {
      const store = await setup({ url: { liveToken: LIVE }, configured: false }).start();
      expect(store.error()).toEqual({ key: 'liveNotConfigured' });
    });
  });

  describe('admin viewer', () => {
    it('reads the tournament from the dashboard and watches it while it is active', async () => {
      const { dashboard, start, feed } = setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: 'shared' } });
      dashboard.given('shared', { id: 't1', status: 'active', state: storedTournament() });
      const store = await start();
      expect(store.mode).toBe('admin');
      expect(dashboard.reads).toEqual([{ source: 'shared', id: 't1' }]);
      expect(store.tournament()?.hostingMode).toBe('shared');
      expect(feed.watching()).toEqual(['shared:t1']);
      expect(store.arena()).toMatchObject({ kicker: 'live', status: 'following' });
    });

    it('an archived tournament is not watched and offers its backup', async () => {
      const { dashboard, start, feed, analytics } = setup({
        url: { dashboardViewerId: 't1', dashboardViewerSource: 'local' },
      });
      dashboard.given('local', { id: 't1', status: 'archived', state: storedTournament() });
      const store = await start();
      expect(feed.watching()).toEqual([]);
      expect(store.arena()).toMatchObject({
        kicker: 'adminArchive',
        badge: 'archived',
        status: 'archived',
        elapsed: null,
      });

      URL.createObjectURL = () => 'blob:backup';
      URL.revokeObjectURL = () => undefined;
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      store.exportBackup();
      expect(click).toHaveBeenCalledTimes(1);
      expect(store.backupExported()).toBe(true);
      expect(analytics.calls.some((call) => call.kind === 'capture' && call.event === 'backup_exported')).toBe(true);
      click.mockRestore();

      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(dashboard.reads).toHaveLength(1);
    });

    it('a refused read says access is not authorized, and keeps trying', async () => {
      const { dashboard, start } = setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: 'local' } });
      const store = await start();
      expect(store.error()).toEqual({ key: 'adminForbidden' });
      dashboard.given('local', { id: 't1', status: 'active', state: storedTournament() });
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(store.tournament()).not.toBeNull();
      expect(store.error()).toBeNull();
    });

    it('an unknown source, or no backend, is unavailable', async () => {
      const unknown = await setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: null } }).start();
      expect(unknown.error()).toEqual({ key: 'adminUnavailable' });
      TestBed.resetTestingModule();
      const unconfigured = await setup({
        url: { dashboardViewerId: 't1', dashboardViewerSource: 'local' },
        configured: false,
      }).start();
      expect(unconfigured.error()).toEqual({ key: 'adminUnavailable' });
    });
  });

  describe('freshness', () => {
    async function following() {
      const harness = setup({ url: { inviteToken: INVITE } });
      const state = projectionState();
      harness.sharedRepo.given(INVITE, shared({ status: 'active', state, canJoin: false }));
      const store = await harness.start();
      return { ...harness, store, state };
    }

    it('a realtime notice re-reads the tournament and counts the update', async () => {
      const { sharedRepo, store, feed, state } = await following();
      sharedRepo.given(INVITE, shared({ status: 'active', state: oneMoreScore(state), canJoin: false }));
      feed.trigger('shared', 'shared-1');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.arena()?.completedMatches).toBe(3);
      expect(store.updateCount()).toBe(1);
      expect(store.takeFirstUpdate()).toBe('guest-rounds');
      expect(store.updateCount()).toBe(0);
      expect(store.takeFirstUpdate()).toBe('');
    });

    it('the poll picks up a change the realtime notice missed', async () => {
      const { sharedRepo, store, state } = await following();
      sharedRepo.given(INVITE, shared({ status: 'active', state: oneMoreScore(state), canJoin: false }));
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(store.updateCount()).toBe(1);
    });

    it('the same tournament again changes nothing', async () => {
      const { store } = await following();
      const before = store.tournament();
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(store.updateCount()).toBe(0);
      expect(store.tournament()).toBe(before);
    });

    it('a hidden page does not poll', async () => {
      const { sharedRepo } = await following();
      const reads = sharedRepo.calls.length;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(sharedRepo.calls.length).toBe(reads);
    });

    it('stops watching and polling once the tournament is over', async () => {
      const { sharedRepo, store, feed, state } = await following();
      sharedRepo.given(INVITE, shared({ status: 'completed', state: { ...state, finishedAt: 'x' }, canJoin: false }));
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(store.status()).toBe('completed');
      expect(feed.watching()).toEqual([]);
      const reads = sharedRepo.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      expect(sharedRepo.calls.length).toBe(reads);
    });

    it('leaves no watch, poll or clock behind when the page goes away', async () => {
      const { sharedRepo, feed } = await following();
      expect(feed.watching()).toEqual(['shared:shared-1']);
      TestBed.resetTestingModule();
      expect(feed.watching()).toEqual([]);
      const reads = sharedRepo.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      expect(sharedRepo.calls.length).toBe(reads);
    });

    it('opens no watch when the page is gone before the first read arrives', async () => {
      const harness = setup({ url: { inviteToken: INVITE } });
      let resolve: (value: ReturnType<typeof shared>) => void = () => undefined;
      harness.sharedRepo.getSharedTournament = () => new Promise((done) => (resolve = done));
      TestBed.inject(SharedViewStore);
      await vi.advanceTimersByTimeAsync(0);
      TestBed.resetTestingModule();
      resolve(shared());
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.feed.watching()).toEqual([]);
    });

    it('the clock ticks only while the tournament runs', async () => {
      const { store } = await following();
      const clock = TestBed.inject(CLOCK) as FakeClock;
      clock.advance(65_000);
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.now()).toBe(clock.now());
    });
  });

  describe('guest projection', () => {
    async function guest(previousChance?: { p: number; s: string }) {
      const local = new MemoryStorage();
      const state = projectionState();
      const harness = setup({ url: { inviteToken: INVITE }, local });
      harness.sharedRepo.given(INVITE, shared({ status: 'active', state, canJoin: false }));
      await harness.sharedRepo.joinSharedTournament(INVITE, 'Ana');
      if (previousChance)
        local.setItem(`setpoint.chance.shared-1.${state.players[0].id}.3`, JSON.stringify(previousChance));
      const store = await harness.start();
      return { ...harness, store };
    }

    it("is the guest's own path, opened from the bar and closed by going back to the page", async () => {
      const { store, events } = await guest();
      const projection = TestBed.inject(ProjectionController);
      expect(projection.configured).toBe(true);
      expect(projection.playerId).toBe(store.guestPlayerId());
      expect(projection.chanceLabel).not.toBe('');

      expect(store.openProjection()).toBe(true);
      expect(store.tab()).toBe('projection');
      expect(events()).toContain('qualification_opened');
      expect(store.showMain()).toBe(true);
      expect(store.tab()).toBe('main');
      expect(store.showMain()).toBe(false);
    });

    it('remembers the chance, and says so when a result moves it', async () => {
      const { store, local, events } = await guest({ p: 0.99, s: 'chance' });
      const toast = store.chanceToast();
      expect(toast?.tone).toBe('down');
      expect(toast?.goal).toBe(3);
      expect(toast?.from).toBe('99%');
      expect(events()).toEqual(['chance_notification_shown']);
      expect(JSON.parse(local.getItem(`setpoint.chance.shared-1.${store.guestPlayerId()}.3`) ?? '{}')).toHaveProperty(
        'p',
      );

      expect(store.openFromChanceToast()).toBe(true);
      expect(store.chanceToast()).toBeNull();
      expect(events()).toContain('chance_notification_opened');
    });

    it('the notice goes away on its own after 7 seconds', async () => {
      const { store } = await guest({ p: 0.99, s: 'chance' });
      expect(store.chanceToast()).not.toBeNull();
      await vi.advanceTimersByTimeAsync(6999);
      expect(store.chanceToast()).not.toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(store.chanceToast()).toBeNull();
    });

    it('an admin viewing a shared tournament gets the alert too, as the profile names a player', async () => {
      const local = new MemoryStorage();
      const state = projectionState();
      local.setItem('setpoint.profile.v1', JSON.stringify({ name: 'Ana', autoJoin: true }));
      local.setItem(`setpoint.chance.t1.${state.players[0].id}.3`, JSON.stringify({ p: 0.99, s: 'chance' }));
      const { dashboard, start } = setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: 'shared' }, local });
      dashboard.given('shared', { id: 't1', status: 'active', state });
      const store = await start();
      expect(store.chanceToast()?.tone).toBe('down');
    });

    it('a live link has no projection (its tournament is local), so no alert', async () => {
      const local = new MemoryStorage();
      const state = projectionState();
      local.setItem('setpoint.profile.v1', JSON.stringify({ name: 'Ana', autoJoin: true }));
      local.setItem(`setpoint.chance.live-1.${state.players[0].id}.3`, JSON.stringify({ p: 0.99, s: 'chance' }));
      const { live, start } = setup({ url: { liveToken: LIVE }, local });
      live.given(LIVE, { id: 'live-1', status: 'active', state });
      const store = await start();
      expect(TestBed.inject(ProjectionController).configured).toBe(false);
      expect(store.chanceToast()).toBeNull();
    });

    it('stays quiet on the first visit (nothing to compare with)', async () => {
      const { store } = await guest();
      expect(store.chanceToast()).toBeNull();
    });
  });
});
