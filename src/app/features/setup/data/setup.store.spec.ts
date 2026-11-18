import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import setupPtBr from '../../../../../public/i18n/setup/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { PROFILE_KEY } from '../../../core/profile';
import { SetupProgress } from '../../../core/setup-progress';
import { namedPlayers, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { setupFakes } from '../setup.fakes';
import { SetupStore } from './setup.store';

function setup(options: { configured?: boolean; profile?: object } = {}) {
  const fakes = setupFakes({ configured: options.configured });
  if (options.profile) fakes.local.setItem(PROFILE_KEY, JSON.stringify(options.profile));
  TestBed.configureTestingModule({
    imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
    providers: [...fakes.providers, SetupStore],
  });
  const store = TestBed.inject(SetupStore);
  const tournament = TestBed.inject(CurrentTournament);
  const progress = TestBed.inject(SetupProgress);
  const owned = TestBed.inject(OwnedSharedTournament);
  const hooks = fakes.hooks;
  const events = () => fakes.analytics.calls.map((call) => (call.kind === 'capture' ? call.event : call.kind));
  return { ...fakes, store, tournament, progress, owned, hooks, events };
}

const fill = (store: SetupStore, names: string[]) => {
  for (const name of names) {
    store.setNewPlayer({ name });
    store.addPlayer();
  }
};
const EIGHT = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'];

beforeEach(() => TestBed.resetTestingModule());

describe('SetupStore: the format', () => {
  it('keeps size, mode and games in memory until the step is left, and saves the toggles at once', () => {
    const { store, tournament, hooks } = setup();
    store.setSize(12);
    store.setTournamentMode('groups');
    store.setGamesToWin(5);
    store.setName('Sábado');
    expect(tournament.state()).toMatchObject({ size: 12, tournamentMode: 'groups', gamesToWin: 5, name: 'Sábado' });
    expect(hooks.save).not.toHaveBeenCalled();
    store.setDoublesFormat('mixed');
    expect(hooks.save).toHaveBeenCalledTimes(1);
    expect(store.isMixed()).toBe(true);
    expect(store.courts()).toEqual([3]);
  });

  it('offers the group size and the finals pairing only for the 20-player rotating groups', () => {
    const { store, tournament } = setup();
    store.setGroupSize(5);
    expect(tournament.state().groupSize).toBeUndefined();
    store.setTournamentMode('groups');
    store.setSize(20);
    expect(store.groupQualification()).toBe(true);
    store.setGroupSize(5);
    store.setFinalsPairing('seededDraw');
    expect(tournament.state()).toMatchObject({ groupSize: 5, finalsPairing: 'seededDraw', courts: 4 });
    expect(store.review()).toBe('groupsQualification');
    store.setSize(12);
    expect(store.groupQualification()).toBe(false);
  });

  it('offers early finals only for the Super 24 mixed on 3 courts', () => {
    const { store, tournament, hooks } = setup();
    store.setEarlyFinals(true);
    expect(tournament.state().earlyFinalsEnabled).toBeUndefined();
    store.setDoublesFormat('mixed');
    store.setSize(24);
    store.setCourts(3);
    hooks.save.mockClear();
    expect(store.earlyFinalsAvailable()).toBe(true);
    store.setEarlyFinals(true);
    store.setMixedFinalFormat('direct');
    expect(tournament.state()).toMatchObject({ earlyFinalsEnabled: true, mixedFinalFormat: 'direct' });
    expect(hooks.save).toHaveBeenCalledTimes(2);
  });

  it('the hosting choice needs a backend', () => {
    const { store, tournament, hooks } = setup({ configured: false });
    store.setHostingMode('shared');
    expect(tournament.state().hostingMode).toBe('local');
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it('choosing shared resets the shared messages, turns the projection on and saves', () => {
    const { store, tournament, hooks, owned } = setup();
    owned.fail({ key: 'full' });
    store.setHostingMode('shared');
    expect(tournament.state()).toMatchObject({ hostingMode: 'shared', qualificationStats: true });
    expect(owned.error()).toBeNull();
    expect(hooks.save).toHaveBeenCalledOnce();
  });

  it('locks every choice once the schedule exists', () => {
    const { store, tournament, hooks } = setup();
    tournament.set(tournamentState({ rounds: [{ number: 1, matches: [], restingPlayerIds: [] }] }));
    store.setDoublesFormat('mixed');
    store.setHostingMode('shared');
    store.setQualificationStats(true);
    expect(tournament.state().doublesFormat).toBeUndefined();
    expect(hooks.save).not.toHaveBeenCalled();
    expect(store.canGoTo(1)).toBe(false);
  });
});

describe('SetupStore: moving between steps', () => {
  it('step 1 trims the name, saves, goes to step 2 and tells analytics', async () => {
    const { store, tournament, progress, hooks, events } = setup();
    store.setName('  Sábado  ');
    expect(await store.next()).toBe(true);
    expect(tournament.state().name).toBe('Sábado');
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(progress.step()).toBe(2);
    expect(events()).toEqual(['tournament_setup_step_completed', 'tournament_setup_step_viewed']);
  });

  it('a blank name becomes a default one', async () => {
    const { store, tournament } = setup();
    store.setName('   ');
    await store.next();
    expect(tournament.state().name).toBe('Meu torneio');
  });

  it('adds the device owner as the first player when the profile says so', async () => {
    const { store, tournament, events } = setup({ profile: { name: 'Ana Souza', autoJoin: true } });
    await store.next();
    expect(tournament.state().players.map((player) => player.name)).toEqual(['Ana Souza']);
    expect(events()).toContain('profile_auto_joined');
  });

  it('does not add the owner who chose only to manage, or in a mixed tournament without a category (and says why)', async () => {
    const off = setup({ profile: { name: 'Ana', autoJoin: false } });
    await off.store.next();
    expect(off.tournament.state().players).toEqual([]);
    TestBed.resetTestingModule();
    const mixed = setup({ profile: { name: 'Ana', autoJoin: true } });
    mixed.store.setDoublesFormat('mixed');
    await mixed.store.next();
    expect(mixed.tournament.state().players).toEqual([]);
    expect(mixed.hooks.notify).toHaveBeenCalledWith(
      'Defina sua categoria no perfil para entrar automaticamente em torneios mistos.',
      'success',
    );
  });

  it('step 2 needs the whole roster, then goes to step 3 and clears the notice', async () => {
    const { store, progress, hooks, tournament } = setup();
    await store.next();
    expect(await store.next()).toBe(false);
    expect(hooks.notify).toHaveBeenCalledWith('Cadastre exatamente 8 jogadores para continuar.', 'error');
    fill(store, EIGHT);
    expect(tournament.state().players).toHaveLength(8);
    expect(await store.next()).toBe(true);
    expect(progress.step()).toBe(3);
    expect(hooks.clearNotice).toHaveBeenCalled();
  });

  it('a completed step can be revisited (and says so), "← Voltar" goes back silently', async () => {
    const { store, progress, events } = setup();
    await store.next();
    fill(store, EIGHT);
    await store.next();
    store.goTo(1);
    expect(progress.step()).toBe(1);
    expect(events()).toContain('tournament_setup_step_back');
    await store.next();
    store.previous();
    expect(progress.step()).toBe(1);
    store.goTo(2);
    expect(progress.step()).toBe(1);
  });
});

describe('SetupStore: the players', () => {
  it('adds a player, clears the form, saves and tells analytics', () => {
    const { store, tournament, hooks, events } = setup();
    store.setNewPlayer({ name: ' Ana ' });
    expect(store.addPlayer()).toBe(true);
    expect(tournament.state().players.map((player) => player.name)).toEqual(['Ana']);
    expect(store.newPlayer()).toEqual({ name: '', gender: '', avatar: '' });
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(events()).toEqual(['player_added']);
  });

  it('shows why a player was not added, and clears the message when the name changes', () => {
    const { store } = setup();
    store.setNewPlayer({ name: 'Ana' });
    store.addPlayer();
    store.setNewPlayer({ name: 'ana' });
    expect(store.addPlayer()).toBe(false);
    expect(store.playerError()).toBe('duplicate');
    store.setNewPlayer({ name: 'Bia' });
    expect(store.playerError()).toBeNull();
  });

  it('ignores an empty name without a message', () => {
    const { store } = setup();
    expect(store.addPlayer()).toBe(false);
    expect(store.playerError()).toBeNull();
  });

  it('adds a batch with one notice, removes a player, and changes a category in mixed doubles', () => {
    const { store, tournament, hooks } = setup();
    store.addBatch([
      { name: 'Ana', gender: '' },
      { name: 'Bia', gender: '' },
    ]);
    expect(hooks.save).toHaveBeenCalledWith('Participantes adicionados em lote.');
    const [ana] = tournament.state().players;
    store.removePlayer(ana.id);
    expect(tournament.state().players.map((player) => player.name)).toEqual(['Bia']);
    store.setDoublesFormat('mixed');
    store.setPlayerGender(tournament.state().players[0].id, 'female');
    expect(tournament.state().players[0].gender).toBe('female');
  });

  it('swaps the fixed pairs', () => {
    const { store, tournament } = setup();
    store.setTournamentMode('groups');
    store.setGroupFormat('fixed');
    store.addBatch(EIGHT.map((name) => ({ name, gender: '' as const })));
    const ids = tournament.state().players.map((player) => player.id);
    store.swapFixedPair(0, 0, ids[2]);
    expect(tournament.state().fixedPairs?.[0]).toEqual([ids[2], ids[1]]);
    expect(tournament.state().fixedPairs?.[1]).toEqual([ids[0], ids[3]]);
  });

  it('refuses a fixed pair of the same category in mixed doubles', () => {
    const { store, tournament, hooks } = setup();
    store.setTournamentMode('groups');
    store.setGroupFormat('fixed');
    store.setDoublesFormat('mixed');
    store.addBatch(EIGHT.map((name, index) => ({ name, gender: index < 4 ? ('male' as const) : ('female' as const) })));
    const { players, fixedPairs } = tournament.state();
    expect(fixedPairs?.[0]).toEqual([players[0].id, players[4].id]);
    hooks.notify.mockClear();
    store.swapFixedPair(0, 1, players[1].id);
    expect(hooks.notify).toHaveBeenCalledWith('Cada dupla precisa ter um atleta masculino e um feminino.', 'error');
    expect(tournament.state().fixedPairs).toEqual(fixedPairs);
    store.swapFixedPair(0, 0, players[1].id);
    expect(tournament.state().fixedPairs?.[0]).toEqual([players[1].id, players[4].id]);
  });

  it('cannot remove a participant of a shared tournament', () => {
    const { store, tournament, hooks } = setup();
    tournament.set(tournamentState({ hostingMode: 'shared', players: namedPlayers(2) }));
    store.removePlayer('p1');
    expect(hooks.notify).toHaveBeenCalledWith(
      'Não é possível remover participantes do torneio compartilhado.',
      'error',
    );
    expect(tournament.state().players).toHaveLength(2);
  });
});

describe('SetupStore: the shared tournament', () => {
  it('needs a backend, a name, a category in mixed doubles and an empty roster', async () => {
    const off = setup({ configured: false });
    off.tournament.update((state) => ({ ...state, hostingMode: 'shared' }));
    expect(await off.store.next()).toBe(false);
    expect(off.hooks.notify).toHaveBeenLastCalledWith(
      'O modo compartilhado ainda não está configurado neste deploy.',
      'error',
    );
    TestBed.resetTestingModule();
    const { store, tournament, hooks } = setup();
    store.setHostingMode('shared');
    await store.next();
    expect(hooks.notify).toHaveBeenLastCalledWith('Informe seu nome para entrar como moderador.', 'error');
    store.setModerator({ name: 'Moderadora' });
    store.setDoublesFormat('mixed');
    await store.next();
    expect(hooks.notify).toHaveBeenLastCalledWith('Selecione sua categoria para entrar no torneio misto.', 'error');
    store.setModerator({ gender: 'female' });
    tournament.update((state) => ({ ...state, players: namedPlayers(1) }));
    await store.next();
    expect(hooks.notify).toHaveBeenLastCalledWith(
      'Para compartilhar, comece com um torneio sem lista local. Os participantes entrarão pelo convite.',
      'error',
    );
  });

  it('creates it, goes to step 2 and tells analytics', async () => {
    const { store, tournament, progress, owned, shared, events } = setup();
    store.setHostingMode('shared');
    store.setModerator({ name: 'Moderadora' });
    expect(await store.next()).toBe(false);
    expect(owned.moderator()).toBe(true);
    expect(tournament.state().sharedTournamentId).toBe('shared-1');
    expect(progress.step()).toBe(2);
    expect(store.canManageParticipants()).toBe(true);
    expect(store.inviteUrl()).toBe('https://app.test/?invite=invite-1');
    expect(shared.calls.map((call) => call.method)).toEqual(['createSharedTournament']);
    expect(events()).toEqual([
      'tournament_setup_step_completed',
      'tournament_setup_step_viewed',
      'tournament_created',
      'shared_tournament_created',
    ]);
  });

  it('stays on step 1 and shows the error when the server refuses', async () => {
    const { store, progress, shared } = setup();
    store.setHostingMode('shared');
    store.setModerator({ name: 'Moderadora' });
    shared.fail('authentication_required');
    await store.next();
    expect(progress.step()).toBe(1);
    expect(store.sharedError()).toEqual({ key: 'authRequired' });
  });

  it('adds and removes a participant who has no phone', async () => {
    const { store, tournament } = setup();
    store.setHostingMode('shared');
    store.setModerator({ name: 'Moderadora' });
    await store.next();
    store.setManualParticipant({ name: 'Sem celular' });
    await store.addManualParticipant();
    expect(tournament.state().players.map((player) => player.name)).toEqual(['Moderadora', 'Sem celular']);
    expect(store.manualParticipant().name).toBe('');
    const manual = tournament.state().players.find((player) => player.manual)!;
    await store.removeManualParticipant(manual.id);
    expect(tournament.state().players).toHaveLength(1);
  });

  it('asks for the category of a manual participant in mixed doubles', async () => {
    const { store, shared } = setup();
    store.setHostingMode('shared');
    store.setDoublesFormat('mixed');
    store.setModerator({ name: 'Moderadora', gender: 'female' });
    await store.next();
    store.setManualParticipant({ name: 'Sem celular' });
    await store.addManualParticipant();
    expect(store.sharedError()).toEqual({ key: 'categoryRequired' });
    expect(shared.calls.map((call) => call.method)).toEqual(['createSharedTournament']);
  });

  it('can start only when the moderator has all the seats filled', async () => {
    const { store, tournament } = setup();
    expect(store.canStart()).toBe(true);
    store.setHostingMode('shared');
    store.setModerator({ name: 'Moderadora' });
    await store.next();
    expect(store.canStart()).toBe(false);
    tournament.update((state) => ({ ...state, sharedStatus: 'ready' }));
    expect(store.canStart()).toBe(true);
  });

  it('fills the moderator from the profile without overriding what was typed', () => {
    const { store } = setup({ profile: { name: 'Ana Souza', gender: 'female' } });
    TestBed.flushEffects();
    expect(store.moderator()).toMatchObject({ name: 'Ana Souza', gender: 'female' });
    store.setModerator({ name: 'Outra pessoa' });
    TestBed.flushEffects();
    expect(store.moderator().name).toBe('Outra pessoa');
  });
});

describe('SetupStore: the tour', () => {
  it('starts by itself only while it is on and the step was not finished', () => {
    const { store, local } = setup();
    expect(store.shouldAutoStartTour(1)).toBe(true);
    store.tourFinished(1);
    expect(local.getItem('setpoint.tutorial.setup')).toBe('done');
    expect(store.shouldAutoStartTour(1)).toBe(false);
    expect(store.shouldAutoStartTour(2)).toBe(true);
    store.tourFinished(2);
    expect(local.getItem('setpoint.tutorial.setup.step2')).toBe('done');
  });

  it('turning the tips off is remembered and stops the tour; turning them on makes every tour new again', () => {
    const { store, local, events } = setup();
    store.tourFinished(3);
    store.toggleTutorial();
    expect(store.tutorialEnabled()).toBe(false);
    expect(local.getItem('setpoint.tutorial.setup')).toBe('off');
    expect(store.shouldAutoStartTour(2)).toBe(false);
    store.toggleTutorial();
    expect(store.tutorialEnabled()).toBe(true);
    expect(store.shouldAutoStartTour(3)).toBe(true);
    expect(events()).toEqual(['tutorial_finished', 'tutorial_disabled', 'tutorial_enabled']);
  });

  it('"Desligar dicas" from the popover turns them off for good', () => {
    const { store, local, events } = setup();
    store.tourSwitchedOff(2);
    expect(store.tutorialEnabled()).toBe(false);
    expect(local.getItem('setpoint.tutorial.setup')).toBe('off');
    expect(events()).toEqual(['tutorial_disabled']);
  });

  it('reads the saved preference when it starts', () => {
    const fakes = setupFakes();
    fakes.local.setItem('setpoint.tutorial.setup', 'off');
    TestBed.configureTestingModule({
      imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
      providers: [...fakes.providers, SetupStore],
    });
    expect(TestBed.inject(SetupStore).tutorialEnabled()).toBe(false);
  });
});
