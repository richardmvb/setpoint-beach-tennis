import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { Match, TournamentState } from '../../../core/models';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { SelectedRound } from '../../../core/selected-round';
import { withTieDraw } from '../../../domain/tournament-play/tie-draw';
import { storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ShareResultsSession } from '../share-results-dialog/share-results-session';
import { tournamentFakes } from '../tournament.fakes';
import { TournamentStore } from './tournament.store';

function setup(initial: TournamentState = storedTournament()) {
  const fakes = tournamentFakes();
  TestBed.configureTestingModule({
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
  });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(initial);
  const hooks = fakes.hooks;
  const store = TestBed.inject(TournamentStore);
  const events = () => fakes.analytics.calls.map((call) => (call.kind === 'capture' ? call.event : call.kind));
  return { ...fakes, store, tournament, hooks, events };
}

/** Every group-stage match played: the winner has 4 games, the loser 0 to 3 (so the ranking is not all tied). */
function played(state: TournamentState = storedTournament()): TournamentState {
  let index = 0;
  const rounds = state.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: index++ % 4 })),
  }));
  return { ...state, rounds };
}

/** Every match ends 4 to 4: no rule can separate the players, so the tie draw is needed. */
function allTied(): TournamentState {
  const state = storedTournament();
  return {
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: 4 })),
    })),
  };
}

const roundMatch = (state: TournamentState, id: string): Match =>
  state.rounds.flatMap((round) => round.matches).find((match) => match.id === id)!;
const finalMatch = (state: TournamentState, kind: string): Match =>
  state.finals!.matches.find((match) => match.finalKind === kind)!;

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => vi.useRealTimers());

describe('TournamentStore: who may edit', () => {
  it('a local tournament is editable until its finals exist, and its finals until it is finished', () => {
    const { store, tournament } = setup(played());
    expect(store.canEditRoundScores()).toBe(true);
    expect(store.canEditFinalScores()).toBe(true);
    tournament.update((state) => ({ ...state, finals: { matches: [], complete: false, podiumPlayerIds: [] } }));
    expect(store.canEditRoundScores()).toBe(false);
    expect(store.roundsLocked()).toBe(true);
    expect(store.canEditFinalScores()).toBe(true);
    tournament.update((state) => ({ ...state, finishedAt: '2026-11-17T12:00:00.000Z' }));
    expect(store.canEditFinalScores()).toBe(false);
  });

  it('a shared tournament is editable only by its moderator, and only while active', () => {
    const { store, tournament } = setup({ ...storedTournament(), hostingMode: 'shared', sharedStatus: 'active' });
    expect(store.canEditScores()).toBe(false);
    TestBed.inject(OwnedSharedTournament).setModerator(true);
    expect(store.canEditScores()).toBe(true);
    tournament.update((state) => ({ ...state, sharedStatus: 'completed' }));
    expect(store.canEditScores()).toBe(false);
  });
});

describe('TournamentStore: round scores', () => {
  it('commits a valid score as a new tournament, saves it and tells analytics', () => {
    const { store, tournament, hooks, events } = setup();
    const before = tournament.state();
    const match = roundMatch(before, 'r1-m2');
    store.scoreChanged(match, 'a', 4);
    expect(hooks.save).not.toHaveBeenCalled();
    store.scoreChanged(match, 'b', 2);
    const after = tournament.state();
    expect(after).not.toBe(before);
    expect(roundMatch(after, 'r1-m2')).toMatchObject({ scoreA: 4, scoreB: 2 });
    expect(roundMatch(before, 'r1-m2').scoreA).toBeNull();
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(events()).toContain('match_score_recorded');
  });

  it('keeps what is typed until it is a score, and says what is missing', () => {
    const { store, tournament, hooks } = setup();
    const match = roundMatch(tournament.state(), 'r1-m2');
    expect(store.scoreStatus(match)).toBe('fillBoth');
    store.scoreChanged(match, 'a', 3);
    expect(store.draftOf(match)).toMatchObject({ a: 3, b: null });
    expect(store.scoreStatus(match)).toBe('fillBoth');
    store.scoreChanged(match, 'b', 2);
    expect(store.scoreStatus(match)).toBe('invalid');
    expect(roundMatch(tournament.state(), 'r1-m2').scoreA).toBeNull();
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it('a valid score replaces the draft and reads as saved', () => {
    const { store, tournament } = setup();
    const match = roundMatch(tournament.state(), 'r1-m2');
    store.scoreChanged(match, 'a', 4);
    store.scoreChanged(match, 'b', 1);
    const saved = roundMatch(tournament.state(), 'r1-m2');
    expect(store.draftOf(saved)).toEqual({ a: 4, b: 1 });
    expect(store.scoreStatus(saved)).toBe('saved');
  });

  it('ignores a draft once the match changed under it (a sync, another tournament)', () => {
    const { store, tournament } = setup();
    const match = roundMatch(tournament.state(), 'r1-m2');
    store.scoreChanged(match, 'a', 3);
    // The match gets a score from elsewhere: what was typed over the old, empty score no longer applies.
    tournament.update((state) => ({
      ...state,
      rounds: state.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((m) => (m.id === 'r1-m2' ? { ...m, scoreA: 4, scoreB: 0 } : m)),
      })),
    }));
    expect(store.draftOf(roundMatch(tournament.state(), 'r1-m2'))).toEqual({ a: 4, b: 0 });
  });

  it('forgets a draft when another tournament with the same match ids is opened', () => {
    const { store, tournament } = setup();
    store.scoreChanged(roundMatch(tournament.state(), 'r1-m2'), 'a', 3);
    tournament.set({ ...storedTournament(), createdAt: '2026-12-01T10:00:00.000Z' });
    expect(store.draftOf(roundMatch(tournament.state(), 'r1-m2'))).toEqual({ a: null, b: null });
  });

  it('does nothing when the rounds are locked', () => {
    const { store, tournament, hooks } = setup(played());
    tournament.update((state) => ({ ...state, finals: { matches: [], complete: false, podiumPlayerIds: [] } }));
    const match = roundMatch(tournament.state(), 'r1-m2');
    store.scoreChanged(match, 'a', 4);
    store.scoreChanged(match, 'b', 0);
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it('does not save the score a match already has', () => {
    const { store, tournament, hooks } = setup();
    const match = roundMatch(tournament.state(), 'r1-m1');
    store.scoreChanged(match, 'a', 4);
    expect(hooks.save).not.toHaveBeenCalled();
    expect(match.scoreB).toBe(2);
  });

  it('removes a score after confirming, and keeps it when the person declines', async () => {
    const { store, tournament, hooks, dialogs } = setup();
    const match = roundMatch(tournament.state(), 'r1-m1');
    dialogs.confirmAnswer = false;
    await store.clearScore(match);
    expect(roundMatch(tournament.state(), 'r1-m1').scoreA).toBe(4);
    dialogs.confirmAnswer = true;
    await store.clearScore(match);
    expect(roundMatch(tournament.state(), 'r1-m1')).toMatchObject({ scoreA: null, scoreB: null });
    expect(hooks.save).toHaveBeenCalledWith('Placar removido.');
    expect(dialogs.confirms[0].title).toBe('Remover o placar desta partida?');
  });

  it('selects a round inside the schedule only', () => {
    const { store } = setup();
    store.selectRound(3);
    expect(store.selectedRound()).toBe(3);
    store.selectRound(99);
    expect(store.selectedRound()).toBe(3);
    TestBed.inject(SelectedRound).reset();
    expect(store.currentRound()?.number).toBe(1);
  });
});

describe('TournamentStore: finals', () => {
  it('generates the finals from the ranking once every match is played', async () => {
    const { store, tournament, hooks, events, dialogs } = setup(played());
    expect(store.canGenerateFinal()).toBe(true);
    await store.generateFinal();
    expect(dialogs.opened).toHaveLength(0);
    expect(tournament.state().finals?.matches.map((m) => m.finalKind)).toEqual(['championship', 'third-place']);
    expect(hooks.save).toHaveBeenCalledWith('Finais geradas com base nos oito primeiros do ranking.');
    expect(events()).toContain('finals_generated');
  });

  it('says so when the schedule is not over', async () => {
    const { store, tournament, hooks } = setup();
    await store.generateFinal();
    expect(tournament.state().finals).toBeFalsy();
    expect(hooks.notify).toHaveBeenCalledWith('Conclua todas as partidas da fase atual para gerar a final.', 'error');
  });

  it('asks for the tie draw first when the ranking cannot split the finalists, then generates the finals', async () => {
    const { store, tournament, dialogs } = setup(allTied());
    dialogs.onOpen = () =>
      tournament.update((state) =>
        withTieDraw(
          state,
          state.players.map((p) => p.id),
          state.players.map((p) => p.id),
          '2026-11-17T10:00:00.000Z',
        ),
      );
    await store.generateFinal();
    expect(dialogs.opened).toHaveLength(1);
    expect(tournament.state().finals?.matches).toHaveLength(2);
  });

  it('generates nothing when the tie draw is cancelled', async () => {
    const { store, tournament, dialogs } = setup(allTied());
    dialogs.openAnswer = false;
    await store.generateFinal();
    expect(dialogs.opened).toHaveLength(1);
    expect(tournament.state().finals).toBeFalsy();
  });

  it('does not open a second tie draw while the first is opening', async () => {
    const { store, dialogs } = setup(allTied());
    dialogs.openAnswer = false;
    await Promise.all([store.generateFinal(), store.generateFinal()]);
    expect(dialogs.opened).toHaveLength(1);
  });

  async function withFinals() {
    const context = setup(played());
    await context.store.generateFinal();
    return context;
  }

  it('records the games of a final, and the tie-break only at 6 to 6', async () => {
    const { store, tournament, events } = await withFinals();
    const champ = () => finalMatch(tournament.state(), 'championship');
    store.finalScoreChanged(champ(), 'a', 6);
    store.finalScoreChanged(champ(), 'b', 6);
    expect(store.finalStatus(champ())).toBe('tieBreak');
    store.finalScoreChanged(champ(), 'tieBreakA', 7);
    store.finalScoreChanged(champ(), 'tieBreakB', 5);
    expect(champ()).toMatchObject({ scoreA: 6, scoreB: 6, tieBreakA: 7, tieBreakB: 5 });
    expect(store.finalStatus(champ())).toBe('resultSaved');
    store.finalScoreChanged(champ(), 'b', 4);
    expect(champ()).toMatchObject({ scoreB: 4, tieBreakA: null, tieBreakB: null });
    expect(events().filter((event) => event === 'final_score_recorded')).toHaveLength(1);
  });

  it('completes the podium when both finals have a winner, and offers to finish the tournament', async () => {
    const { store, tournament } = await withFinals();
    for (const kind of ['championship', 'third-place']) {
      store.finalScoreChanged(finalMatch(tournament.state(), kind), 'a', 6);
      store.finalScoreChanged(finalMatch(tournament.state(), kind), 'b', 2);
    }
    expect(tournament.state().finals?.complete).toBe(true);
    expect(store.finalPodium()).toHaveLength(4);
    expect(store.canFinalizeTournament()).toBe(true);
  });

  it('scores the championship point by point, and asks before going back to typing', async () => {
    const { store, tournament, dialogs } = await withFinals();
    const champ = () => finalMatch(tournament.state(), 'championship');
    await store.toggleFinalLiveScore(champ());
    expect(champ().livePoints).toEqual([]);
    store.addFinalLivePoint(champ(), 'A');
    store.addFinalLivePoint(champ(), 'B');
    store.addFinalLivePoint(champ(), 'A');
    expect(champ().livePoints).toEqual(['A', 'B', 'A']);
    store.undoFinalLivePoint(champ());
    expect(champ().livePoints).toEqual(['A', 'B']);
    expect(dialogs.confirms).toHaveLength(0);
    dialogs.confirmAnswer = false;
    await store.toggleFinalLiveScore(champ());
    expect(champ().livePoints).toEqual(['A', 'B']);
    dialogs.confirmAnswer = true;
    await store.toggleFinalLiveScore(champ());
    expect('livePoints' in champ()).toBe(false);
    expect(champ()).toMatchObject({ scoreA: null, scoreB: null });
    expect(dialogs.confirms[0].title).toBe('Alterar o modo de placar?');
  });

  it('finishes the tournament only after the typed confirmation', async () => {
    const { store, tournament, hooks, dialogs, events } = await withFinals();
    for (const kind of ['championship', 'third-place']) {
      store.finalScoreChanged(finalMatch(tournament.state(), kind), 'a', 6);
      store.finalScoreChanged(finalMatch(tournament.state(), kind), 'b', 1);
    }
    dialogs.typedAnswer = false;
    expect(await store.finalizeTournament()).toBe(false);
    expect(tournament.state().finishedAt).toBeUndefined();
    expect(events()).toContain('tournament_finalize_cancelled');
    dialogs.typedAnswer = true;
    expect(await store.finalizeTournament()).toBe(true);
    expect(tournament.state().finishedAt).toBeTruthy();
    expect(hooks.save).toHaveBeenLastCalledWith('Torneio finalizado.');
    expect(dialogs.typed[0]).toMatchObject({ title: 'Finalizar o torneio?', phrase: 'finalizar' });
    expect(store.canEditFinalScores()).toBe(false);
  });

  it('tells analytics and the survey once the tournament is finished', async () => {
    const { store, events, surveys } = await withFinals();
    surveys.available = true;
    store.finalized();
    expect(events()).toContain('tournament_finalized');
    await vi.waitFor(() => expect(surveys.shown).toHaveLength(1));
  });
});

describe('TournamentStore: sharing and the clock', () => {
  it('lists the athletes by place and keeps the pick in the session', () => {
    const { store } = setup(played());
    const candidates = store.shareCandidates();
    expect(candidates).toHaveLength(8);
    expect(candidates.map((c) => c.place)).toEqual([...candidates.map((c) => c.place)].sort((a, b) => a - b));
    store.selectSharePlayer(candidates[2].playerId);
    expect(store.sharePlayerId()).toBe(candidates[2].playerId);
    expect(TestBed.inject(ShareResultsSession).playerId()).toBe(candidates[2].playerId);
  });

  it('opens nothing to share before the finals are complete', async () => {
    const { store, dialogs } = setup(played());
    store.selectSharePlayer('p1');
    await store.shareResults();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('shows the elapsed time of a running tournament and moves it with the clock', () => {
    vi.useFakeTimers();
    const fakes = tournamentFakes();
    const started = fakes.clock.iso();
    TestBed.configureTestingModule({
      imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr })],
      providers: [...fakes.providers, TournamentStore],
    });
    TestBed.inject(CurrentTournament).set({ ...tournamentState({ rounds: [] }), startedAt: started });
    const store = TestBed.inject(TournamentStore);
    expect(store.elapsedLabel()).toBe('00:00:00');
    fakes.clock.advance(65_000);
    vi.advanceTimersByTime(1000);
    expect(store.elapsedLabel()).toBe('00:01:05');
  });

  it('a name for a removed player', () => {
    const { store } = setup();
    expect(store.playerName('nobody')).toBe('Jogador removido');
  });
});

describe('TournamentStore: the numbers of the overview', () => {
  it('counts the matches and the progress', () => {
    const { store } = setup(played());
    const total = store.totalMatches();
    expect(total).toBeGreaterThan(0);
    expect(store.completedMatches()).toBe(total);
    expect(store.progress()).toBe(100);
    TestBed.resetTestingModule();
    expect(setup(tournamentState()).store.progress()).toBe(0);
  });

  it('knows whether the doubles are mixed', () => {
    expect(setup(tournamentState({ doublesFormat: 'mixed' })).store.isMixed()).toBe(true);
    TestBed.resetTestingModule();
    expect(setup(tournamentState({ doublesFormat: 'open' })).store.isMixed()).toBe(false);
  });

  it('names the status of the shared tournament, "loading" until there is a snapshot', () => {
    const { store } = setup();
    expect(store.sharedStatusKey()).toBe('loading');
    for (const status of ['archived', 'registration', 'ready', 'active', 'completed'] as const) {
      TestBed.inject(OwnedSharedTournament).replaceSnapshot({
        id: 's',
        status,
        capacity: 8,
        state: storedTournament(),
        inviteToken: '',
        inviteExpiresAt: '',
        expiresAt: null,
      });
      expect(store.sharedStatusKey()).toBe(status);
    }
  });

  it('keeps what the shell last said until it says something else', () => {
    const { store } = setup();
    expect(store.shell().syncAvailable).toBe(false);
    store.shell.set({ ...store.shell(), syncAvailable: true, syncStatus: 'synced' });
    expect(store.shell()).toMatchObject({ syncAvailable: true, syncStatus: 'synced' });
  });
});

describe('TournamentStore: the rules form', () => {
  const unscheduled = (overrides: Partial<TournamentState> = {}) =>
    tournamentState({ players: storedTournament().players, ...overrides });

  it('replaces the tournament on every change instead of editing it', () => {
    const { store, tournament } = setup(unscheduled());
    const before = tournament.state();
    store.setName('Copa');
    store.setGamesToWin(5);
    expect(tournament.state()).not.toBe(before);
    expect(before.name).toBe('Teste');
    expect(tournament.state()).toMatchObject({ name: 'Copa', gamesToWin: 5 });
  });

  it('changes the size, the courts, the mode and the group format through the setup rules', () => {
    const { store, tournament } = setup(unscheduled());
    store.changeSize(12);
    expect(tournament.state()).toMatchObject({ size: 12, courts: 2 });
    store.changeCourts(3);
    expect(tournament.state().courts).toBe(3);
    store.changeTournamentMode('groups');
    expect(tournament.state()).toMatchObject({ tournamentMode: 'groups', courts: 3 });
    expect(store.availableSizes()).toEqual([8, 12, 24]);
    store.changeGroupFormat('fixed');
    expect(tournament.state().groupFormat).toBe('fixed');
    expect(store.requiredRounds()).toBe(tournament.state().size / 2 - 1);
  });

  it('keeps a value the format does not allow out', () => {
    const { store, tournament } = setup(unscheduled());
    store.changeSize(7);
    store.changeCourts(9);
    expect(tournament.state()).toMatchObject({ size: 8, courts: 2 });
  });

  it('saves the doubles format at once, and only before the schedule exists', () => {
    const { store, tournament, hooks } = setup(unscheduled());
    store.changeDoublesFormat('mixed');
    expect(tournament.state().doublesFormat).toBe('mixed');
    expect(hooks.save).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    const scheduled = setup();
    scheduled.store.changeDoublesFormat('mixed');
    expect(scheduled.tournament.state().doublesFormat).not.toBe('mixed');
    expect(scheduled.hooks.save).not.toHaveBeenCalled();
  });

  it('refuses to save after the schedule exists, and says so', () => {
    const { store, hooks } = setup();
    store.saveSettings();
    expect(hooks.notify).toHaveBeenCalledWith(
      'As configurações ficam bloqueadas depois da geração da tabela.',
      'error',
    );
    expect(hooks.save).not.toHaveBeenCalled();
  });

  it('saves a trimmed name and the rounds of the format, and tells analytics', () => {
    const { store, tournament, hooks, events } = setup(unscheduled({ name: '  Copa  ', roundCount: 1 }));
    store.saveSettings();
    expect(tournament.state()).toMatchObject({ name: 'Copa', roundCount: 7 });
    expect(hooks.save).toHaveBeenCalledWith('Configurações salvas.');
    expect(events()).toContain('tournament_settings_saved');
  });

  it('does not save with more athletes than places', () => {
    const { store, hooks } = setup(
      unscheduled({ players: [...storedTournament().players, { id: 'x', name: 'Extra' }] }),
    );
    store.saveSettings();
    expect(hooks.notify).toHaveBeenCalledWith('Remova participantes até ficar com 8.', 'error');
    expect(hooks.save).not.toHaveBeenCalled();
  });
});

describe('TournamentStore: the backup', () => {
  it('downloads the tournament and says so', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const { store, hooks, events } = setup();
    store.exportBackup();
    expect(click).toHaveBeenCalledTimes(1);
    expect(hooks.notify).toHaveBeenCalledWith('Backup JSON exportado.', 'success');
    expect(events()).toContain('backup_exported');
    click.mockRestore();
  });

  it('forwards what only the shell can do', () => {
    const { store } = setup();
    const seen: unknown[] = [];
    store.requests.subscribe((request) => seen.push(request));
    store.request({ kind: 'syncNow' });
    store.request({ kind: 'syncPaused', paused: true });
    expect(seen).toEqual([{ kind: 'syncNow' }, { kind: 'syncPaused', paused: true }]);
  });
});
