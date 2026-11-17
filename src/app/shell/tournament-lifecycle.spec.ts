import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentTournament } from '../core/current-tournament';
import { LocalLiveLink } from '../core/local-live-link';
import type { SharedTournamentSnapshot, TournamentState } from '../core/models';
import { Notices } from '../core/notices';
import { OwnedSharedTournament } from '../core/owned-shared-tournament';
import { AppNavigation } from '../core/routing/app-navigation';
import { SavedTournaments } from '../core/saved-tournaments';
import { SelectedRound } from '../core/selected-round';
import { TournamentSync } from '../core/sync/tournament-sync';
import { capturedEvents, shellFakes } from '../testing/shell-fakes';
import { namedPlayers, storedTournament, tournamentState } from '../testing/tournament-state';
import { translocoTesting } from '../testing/transloco-testing';
import { TournamentLifecycle } from './tournament-lifecycle';

function setup(state: TournamentState = tournamentState({ players: namedPlayers(8) })) {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ imports: [translocoTesting()], providers: fakes.providers });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(state);
  return {
    ...fakes,
    tournament,
    lifecycle: TestBed.inject(TournamentLifecycle),
    notices: TestBed.inject(Notices),
    navigation: TestBed.inject(AppNavigation),
    saved: TestBed.inject(SavedTournaments),
    owned: TestBed.inject(OwnedSharedTournament),
    sync: TestBed.inject(TournamentSync),
    link: TestBed.inject(LocalLiveLink),
    selectedRound: TestBed.inject(SelectedRound),
  };
}

const running = (): TournamentState => ({ ...storedTournament(), hostingMode: 'local', analyticsId: 'a1' });
const backupFile = (state: unknown, size?: number): File => {
  const json = JSON.stringify(state);
  return { size: size ?? json.length, text: () => Promise.resolve(json) } as unknown as File;
};

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => vi.restoreAllMocks());

describe('starting the tournament', () => {
  it('draws the rounds, saves, shows them and records what happened', async () => {
    const { lifecycle, tournament, navigation, notices, selectedRound, analytics, archive, local } = setup();
    selectedRound.select(2, 7);
    await lifecycle.generateSchedule();
    const state = tournament.state();
    expect(state.rounds).toHaveLength(7);
    expect(state.startedAt).toBeTruthy();
    expect(state.analyticsId).toBeTruthy();
    expect(selectedRound.index()).toBe(0);
    expect(navigation.page()).toBe('rounds');
    expect(notices.notice()).toEqual({ tone: 'success', text: 'Todas as rodadas foram geradas e salvas.' });
    expect((JSON.parse(local.getItem('setpoint.tournament.v1') ?? '{}') as TournamentState).rounds).toHaveLength(7);
    expect(capturedEvents(analytics)).toEqual(
      expect.arrayContaining([
        'tournament_created',
        'tournament_started',
        'schedule_generated',
        'tournament_setup_step_completed',
      ]),
    );
    expect(archive.recordLocalTournamentMetrics).toHaveBeenCalledOnce();
  });

  it('draws a group tournament too', async () => {
    const { lifecycle, tournament } = setup(
      tournamentState({ tournamentMode: 'groups', size: 8, courts: 2, players: namedPlayers(8), roundCount: 3 }),
    );
    await lifecycle.generateSchedule();
    expect(tournament.state().groups?.length).toBeGreaterThan(0);
    expect(tournament.state().rounds.length).toBeGreaterThan(0);
  });

  it('asks for exactly the players the format needs', async () => {
    const { lifecycle, notices, tournament } = setup(tournamentState({ players: namedPlayers(5) }));
    await lifecycle.generateSchedule();
    expect(notices.notice()).toEqual({ tone: 'error', key: 'scheduleCount', params: { size: 8, count: 5 } });
    expect(tournament.state().rounds).toEqual([]);
  });

  it('does not draw twice', async () => {
    const { lifecycle, notices } = setup(running());
    await lifecycle.generateSchedule();
    expect(notices.notice()).toMatchObject({ key: 'scheduleExists' });
  });

  it('lets only the moderator of a full shared tournament start it', async () => {
    const shared = tournamentState({
      hostingMode: 'shared',
      sharedTournamentId: 's1',
      sharedStatus: 'registration',
      players: namedPlayers(8),
    });
    const { lifecycle, notices, owned } = setup(shared);
    await lifecycle.generateSchedule();
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'sharedStartModerator' });
    owned.setModerator(true);
    await lifecycle.generateSchedule();
    expect(notices.notice()).toMatchObject({ key: 'sharedStartModerator' });
  });

  it('starts a shared tournament on the server and keeps its answer', async () => {
    const shared = tournamentState({
      hostingMode: 'shared',
      sharedTournamentId: 's1',
      sharedStatus: 'ready',
      players: namedPlayers(8),
    });
    const { lifecycle, owned, tournament, ...fakes } = setup(shared);
    owned.setModerator(true);
    fakes.shared.startSharedTournament.mockImplementation((_id: string, state: TournamentState) =>
      Promise.resolve<SharedTournamentSnapshot>({
        id: 's1',
        status: 'active',
        capacity: 8,
        state: { ...state, sharedStatus: 'active' },
        inviteToken: '',
        inviteExpiresAt: '2099-01-01T00:00:00Z',
        expiresAt: null,
      }),
    );
    await lifecycle.generateSchedule();
    expect(fakes.shared.startSharedTournament).toHaveBeenCalledOnce();
    expect(tournament.state().sharedStatus).toBe('active');
    expect(tournament.state().rounds).toHaveLength(7);
    expect(fakes.archive.recordLocalTournamentMetrics).not.toHaveBeenCalled();
    expect(capturedEvents(fakes.analytics)).not.toContain('tournament_created');
    expect(capturedEvents(fakes.analytics)).toContain('tournament_started');
  });

  it('puts a shared tournament back the way it was when the server refuses', async () => {
    const shared = tournamentState({
      hostingMode: 'shared',
      sharedTournamentId: 's1',
      sharedStatus: 'ready',
      players: namedPlayers(8),
    });
    const { lifecycle, owned, tournament, notices, ...fakes } = setup(shared);
    owned.setModerator(true);
    fakes.shared.startSharedTournament.mockRejectedValue(new Error('Servidor recusou'));
    await lifecycle.generateSchedule();
    expect(tournament.state().rounds).toEqual([]);
    expect(tournament.state().startedAt).toBeUndefined();
    expect(notices.notice()).toEqual({ tone: 'error', text: 'Servidor recusou' });
  });
});

describe('starting over', () => {
  it('asks first, says the tournament stays saved when it is, and clears everything', async () => {
    const { lifecycle, tournament, navigation, notices, saved, dialogs, local, link, ...fakes } = setup(running());
    local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'l', readToken: 'r', writeToken: 'w' }));
    link.restore(tournament.state());
    navigation.initialize('overview');
    const toLanding = await lifecycle.reset();
    expect(toLanding).toBe(true);
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({
      title: 'Iniciar um novo torneio?',
      text: 'Isso apagará a tabela, os placares e os participantes salvos neste navegador.',
      confirmText: 'Apagar e começar',
      tone: 'danger',
    });
    expect(tournament.state().rounds).toEqual([]);
    expect(tournament.state().analyticsId).toBeUndefined();
    expect(navigation.page()).toBe('setup');
    expect(notices.notice()).toMatchObject({ key: 'newTournament' });
    expect(local.getItem('setpoint.tournament.v1')).toBeNull();
    expect(local.getItem('setpoint.local.live.a1')).toBeNull();
    expect(link.writeToken()).toBe('');
    expect(fakes.archive.recordLocalTournamentMetrics.mock.calls[0][1]).toBe(true);
    expect(saved.library.list().map((entry) => entry.id)).toEqual(['a1']);
  });

  it('keeps the wording gentle when the tournament is saved in "Meus torneios"', async () => {
    const { lifecycle, saved, tournament, dialogs } = setup(running());
    saved.library.save(tournament.state());
    await lifecycle.reset();
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({
      text: 'O torneio atual continuará salvo em Meus torneios.',
      confirmText: 'Novo torneio',
    });
  });

  it('does nothing when the person says no', async () => {
    const { lifecycle, tournament, dialogs } = setup(running());
    dialogs.confirm.mockResolvedValue(false);
    expect(await lifecycle.reset()).toBe(false);
    expect(tournament.state().rounds).not.toEqual([]);
  });

  it('waits for a sync that is running', async () => {
    const { lifecycle, notices, sync, tournament, local, link, localLive, dialogs } = setup(running());
    local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'l', readToken: 'r', writeToken: 'w' }));
    link.restore(tournament.state());
    sync.initialize('local', 'a1', tournament.state());
    let finish: (value: unknown) => void = () => undefined;
    localLive.syncLocalLiveTournament.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    sync.stage({ ...tournament.state(), name: 'x' });
    const running$ = sync.run();
    expect(sync.inFlight()).toBe(true);
    expect(await lifecycle.reset()).toBe(false);
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'syncWaitNew' });
    expect(dialogs.confirm).not.toHaveBeenCalled();
    finish({ id: 'l', status: 'active', state: tournament.state() });
    await running$;
  });

  it('asks before discarding changes that were not sent yet', async () => {
    const { lifecycle, tournament, sync, local, link, dialogs } = setup(running());
    local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'l', readToken: 'r', writeToken: 'w' }));
    link.restore(tournament.state());
    sync.initialize('local', 'a1', tournament.state());
    sync.setPaused(true);
    sync.stage({ ...tournament.state(), name: 'x' });
    dialogs.confirm.mockResolvedValueOnce(false);
    expect(await lifecycle.reset()).toBe(false);
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({
      title: 'Alterações ainda não sincronizadas',
      cancelText: 'Voltar',
      confirmText: 'Descartar alterações',
    });
    expect(dialogs.confirm).toHaveBeenCalledOnce();
  });
});

describe('archiving a shared tournament', () => {
  const shared = (): TournamentState => ({
    ...storedTournament(),
    hostingMode: 'shared',
    sharedTournamentId: 's1',
    sharedStatus: 'active',
  });

  it('does nothing unless this device moderates it', async () => {
    const { lifecycle, dialogs } = setup(shared());
    expect(await lifecycle.cancelShared()).toBe(false);
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('archives it on the server and starts over, going to the landing page only when asked', async () => {
    const { lifecycle, owned, tournament, navigation, dialogs, ...fakes } = setup(shared());
    owned.setModerator(true);
    navigation.initialize('overview');
    expect(await lifecycle.cancelShared()).toBe(false);
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({ title: 'Arquivar este torneio e recomeçar?' });
    expect(fakes.shared.cancelSharedTournament).toHaveBeenCalledWith('s1');
    expect(tournament.state().sharedTournamentId).toBeUndefined();
    expect(owned.moderator()).toBe(false);
    expect(navigation.page()).toBe('setup');
  });

  it('is what a reset does for the moderator, and ends on the landing page', async () => {
    const { lifecycle, owned } = setup(shared());
    owned.setModerator(true);
    expect(await lifecycle.reset()).toBe(true);
  });

  it('keeps the tournament when the server cannot archive it', async () => {
    const { lifecycle, owned, tournament, ...fakes } = setup(shared());
    owned.setModerator(true);
    fakes.shared.cancelSharedTournament.mockRejectedValue(new Error('server'));
    expect(await lifecycle.cancelShared(true)).toBe(false);
    expect(tournament.state().sharedTournamentId).toBe('s1');
  });

  it('waits for a sync that is running and for the person to confirm', async () => {
    const { lifecycle, owned, dialogs, notices } = setup(shared());
    owned.setModerator(true);
    dialogs.confirm.mockResolvedValue(false);
    expect(await lifecycle.cancelShared(true)).toBe(false);
    expect(notices.notice()).toBeNull();
  });
});

describe('importing a backup', () => {
  it('refuses a file that is too big or not a backup', async () => {
    const { lifecycle, notices, tournament } = setup();
    await lifecycle.importBackup(backupFile({}, 1_000_001));
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'backupTooLarge' });
    await lifecycle.importBackup(backupFile({ nope: true }));
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'backupInvalid' });
    expect(tournament.state().players).toHaveLength(8);
  });

  it('replaces the tournament, forgets the shared one, and says so', async () => {
    const { lifecycle, tournament, navigation, notices, analytics, dialogs, shared: _shared } = setup();
    await lifecycle.importBackup(
      backupFile({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's9', sharedStatus: 'active' }),
    );
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({ title: 'Importar este backup?', tone: 'danger' });
    const state = tournament.state();
    expect(state.hostingMode).toBe('local');
    expect(state.sharedTournamentId).toBeUndefined();
    expect(state.sharedStatus).toBeUndefined();
    expect(state.rounds.length).toBeGreaterThan(0);
    expect(state.analyticsId).toBeTruthy();
    expect(navigation.page()).toBe('overview');
    expect(notices.notice()).toMatchObject({ key: 'backupLoaded' });
    expect(capturedEvents(analytics)).toContain('backup_imported');
  });

  it('does not ask when there is nothing to replace', async () => {
    const { lifecycle, dialogs } = setup(tournamentState());
    await lifecycle.importBackup(backupFile(storedTournament()));
    expect(dialogs.confirm).not.toHaveBeenCalled();
  });

  it('leaves everything as it was when the person says no', async () => {
    const { lifecycle, tournament, dialogs, notices } = setup();
    dialogs.confirm.mockResolvedValue(false);
    await lifecycle.importBackup(backupFile(storedTournament()));
    expect(tournament.state().rounds).toEqual([]);
    expect(notices.notice()).toBeNull();
  });

  it('opens a finished tournament on the ranking, read-only', async () => {
    const { lifecycle, navigation, notices } = setup(tournamentState());
    const final = (id: string, finalKind: string) => ({
      id,
      finalKind,
      court: 1,
      teamA: ['p1', 'p2'],
      teamB: ['p3', 'p4'],
      scoreA: 6,
      scoreB: 4,
    });
    const finished = {
      ...storedTournament(),
      finals: {
        complete: true,
        podiumPlayerIds: [],
        matches: [final('f1', 'semifinal'), final('f2', 'championship')],
      },
    } as unknown as TournamentState;
    await lifecycle.importBackup(backupFile(finished));
    expect(navigation.page()).toBe('ranking');
    expect(notices.notice()).toMatchObject({ key: 'finishedLoaded' });
  });

  it('refuses while a sync is running, and when the old queue cannot be removed', async () => {
    const { lifecycle, notices, tournament, local, link, sync } = setup(running());
    local.setItem('setpoint.local.live.a1', JSON.stringify({ id: 'l', readToken: 'r', writeToken: 'w' }));
    link.restore(tournament.state());
    sync.initialize('local', 'a1', tournament.state());
    vi.spyOn(local, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await lifecycle.importBackup(backupFile({ ...storedTournament(), analyticsId: 'other' }));
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'queueNotUpdated' });
    expect(tournament.state().analyticsId).toBe('a1');
  });
});

describe('opening a saved tournament', () => {
  it('says when it cannot be found', async () => {
    const { lifecycle, notices } = setup();
    expect(await lifecycle.openSaved('missing')).toBe(false);
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'savedOpenFailed' });
  });

  it('just goes to the one already in use', async () => {
    const { lifecycle, saved, tournament, navigation } = setup(running());
    saved.library.save(tournament.state());
    expect(await lifecycle.openSaved('a1')).toBe(true);
    expect(navigation.page()).toBe('overview');
  });

  it('replaces the tournament in use with the saved one', async () => {
    const { lifecycle, saved, tournament, notices, analytics, dialogs } = setup(running());
    saved.library.save({ ...storedTournament(), analyticsId: 'b2', name: 'Outro', hostingMode: 'local' });
    saved.library.save(tournament.state());
    expect(await lifecycle.openSaved('b2')).toBe(true);
    expect(dialogs.confirm).not.toHaveBeenCalled();
    expect(tournament.state().name).toBe('Outro');
    expect(notices.notice()).toMatchObject({ key: 'savedOpened' });
    expect(capturedEvents(analytics)).toContain('tournament_library_opened_item');
  });

  it('warns that an unsaved, unstarted setup is discarded', async () => {
    const { lifecycle, saved, dialogs } = setup();
    saved.library.save({ ...storedTournament(), analyticsId: 'b2', hostingMode: 'local' });
    await lifecycle.openSaved('b2');
    expect(dialogs.confirm.mock.calls[0][0]).toMatchObject({
      title: 'Abrir outro torneio?',
      confirmText: 'Abrir e descartar',
    });
  });

  it('does not count a local copy of a shared tournament twice', async () => {
    const { lifecycle, saved, tournament, archive } = setup(tournamentState());
    const sharedCopy = {
      ...storedTournament(),
      hostingMode: 'shared' as const,
      sharedTournamentId: 's1',
      analyticsId: undefined,
    };
    saved.library.save(sharedCopy);
    expect(await lifecycle.openSaved('shared-s1')).toBe(true);
    expect(tournament.state().hostingMode).toBe('local');
    expect(saved.library.pendingArchives().some((entry) => entry.id === 'shared-s1')).toBe(false);
    expect(archive.saveLocalTournamentArchive).not.toHaveBeenCalledWith('shared-s1', expect.anything());
  });
});
