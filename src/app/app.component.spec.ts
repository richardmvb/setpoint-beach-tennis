import { Component, input, output } from '@angular/core';
import { type ComponentFixture, DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { TournamentArchive } from './core/archive/tournament-archive';
import { CurrentTournament } from './core/current-tournament';
import type { Page, TournamentState } from './core/models';
import { SURVEYS } from './core/ports/analytics.port';
import { APP_CONFIG } from './core/ports/app-config.port';
import { FakeSurveys } from './core/ports/testing/analytics.fake';
import { testConfig } from './core/ports/testing/app-config.fake';
import { AppNavigation } from './core/routing/app-navigation';
import { TournamentSync } from './core/sync/tournament-sync';
import { LocalProfileStore } from './core/local-profile.store';
import { SetupTourCue } from './features/setup/data/setup-tour-cue';
import { PlayerAvatarComponent } from './features/player-avatar.component';
import type { ShellRequest, TournamentShellState } from './features/tournament/data/tournament.store';
import { ShellDialogs } from './shell/shell-dialogs';
import { TournamentLifecycle } from './shell/tournament-lifecycle';
import { shellFakes } from './testing/shell-fakes';
import { storedTournament } from './testing/tournament-state';
import { translocoTesting } from './testing/transloco-testing';

/** Stand-ins for the lazy features, so the spec is about what the shell does with them. */
@Component({ selector: 'app-tournament', template: '<p>tournament page</p>' })
class TournamentStub {
  static last: TournamentStub | null = null;
  readonly page = input.required<Page>();
  readonly shell = input<TournamentShellState>();
  readonly request = output<ShellRequest>();
  constructor() {
    TournamentStub.last = this;
  }
}
@Component({ selector: 'app-landing', template: '<main>landing page</main>' })
class LandingStub {
  static last: LandingStub | null = null;
  readonly savedCount = input(0);
  readonly start = output<void>();
  readonly resume = output<void>();
  constructor() {
    LandingStub.last = this;
  }
}
@Component({ selector: 'app-dashboard', template: '<main>dashboard page</main>' })
class DashboardStub {
  readonly back = output<void>();
}
@Component({ selector: 'app-shared-view', template: '<p>shared view</p>' })
class SharedViewStub {}
@Component({ selector: 'section[appSetup]', template: '<p>setup page</p>' })
class SetupStub {
  static last: SetupStub | null = null;
  readonly start = output<void>();
  readonly openLibrary = output<void>();
  readonly cancelShared = output<void>();
  constructor() {
    SetupStub.last = this;
  }
}

let fixtureRef: ComponentFixture<AppComponent> | null = null;

/** The features are in `@defer` blocks: renders each one, as the app does once its chunk has loaded. */
async function settle(): Promise<void> {
  const fixture = fixtureRef;
  if (!fixture) return;
  fixture.detectChanges();
  for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
  fixture.detectChanges();
}

/** Waits for what the shell shows once the deferred features have rendered. */
async function eventually<T>(check: () => T): Promise<T> {
  return vi.waitFor(
    async () => {
      await settle();
      return check();
    },
    { timeout: 3000 },
  );
}

const STATE_KEY = 'setpoint.tournament.v1';
const running = (): TournamentState => ({ ...storedTournament(), hostingMode: 'local', analyticsId: 'a1' });

async function show(
  options: Parameters<typeof shellFakes>[0] & {
    stored?: TournamentState;
    landingSeen?: boolean;
    prompted?: boolean;
  } = {},
) {
  const fakes = shellFakes(options);
  if (options.stored) fakes.local.setItem(STATE_KEY, JSON.stringify(options.stored));
  if (options.landingSeen !== false) fakes.local.setItem('setpoint.landing.seen', 'true');
  if (options.prompted !== false) fakes.local.setItem('setpoint.profile.prompted', 'true');
  const view = await render(AppComponent, {
    imports: [translocoTesting()],
    providers: [
      ...fakes.providers,
      { provide: SURVEYS, useValue: new FakeSurveys() },
      { provide: APP_CONFIG, useValue: testConfig({ lockScreenEnabled: options.lockScreen ?? false }) },
    ],
    componentImports: [
      FormsModule,
      PlayerAvatarComponent,
      TranslocoPipe,
      TournamentStub,
      LandingStub,
      DashboardStub,
      SharedViewStub,
      SetupStub,
    ],
  });
  fixtureRef = view.fixture;
  await settle();
  return {
    ...fakes,
    ...view,
    navigation: TestBed.inject(AppNavigation),
    lifecycle: TestBed.inject(TournamentLifecycle),
    sync: TestBed.inject(TournamentSync),
    archive: TestBed.inject(TournamentArchive),
    dialogs$: TestBed.inject(ShellDialogs),
    tournament: TestBed.inject(CurrentTournament),
  };
}

const requestFromPage = async (request: ShellRequest) => {
  await eventually(() => expect(TournamentStub.last).not.toBeNull());
  TournamentStub.last?.request.emit(request);
};

beforeEach(() => {
  TestBed.resetTestingModule();
  fixtureRef = null;
  TestBed.configureTestingModule({ deferBlockBehavior: DeferBlockBehavior.Manual });
  TournamentStub.last = null;
  LandingStub.last = null;
  SetupStub.last = null;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset['theme'];
});

describe('the lock screen', () => {
  it('asks for the password first, and says so when it is wrong', async () => {
    await show({ lockScreen: true });
    expect(screen.getByRole('heading', { name: 'Desbloquear torneio' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    const password = screen.getByLabelText<HTMLInputElement>('Senha');
    fireEvent.input(password, { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(await screen.findByText('Senha incorreta. Tente novamente.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Senha').value).toBe('');
    expect(screen.getByLabelText('Senha').getAttribute('aria-invalid')).toBe('true');
  });

  it('opens the app with the right password, remembers it for the session and starts archiving', async () => {
    const { session, archive } = await show({ lockScreen: true, stored: running() });
    const afterUnlock = vi.spyOn(archive, 'archiveCurrent');
    fireEvent.input(screen.getByLabelText('Senha'), { target: { value: 'bt2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Desbloquear torneio' })).toBeNull());
    expect(session.getItem('setpoint.unlocked')).toBe('true');
    expect(afterUnlock).toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeTruthy();
  });

  it('stays open for the rest of the session once unlocked', async () => {
    const fakes = shellFakes({ lockScreen: true });
    fakes.session.setItem('setpoint.unlocked', 'true');
    fakes.local.setItem('setpoint.landing.seen', 'true');
    await render(AppComponent, {
      imports: [translocoTesting()],
      providers: [...fakes.providers, { provide: SURVEYS, useValue: new FakeSurveys() }],
      componentImports: [
        FormsModule,
        TranslocoPipe,
        PlayerAvatarComponent,
        TournamentStub,
        SetupStub,
        LandingStub,
        DashboardStub,
        SharedViewStub,
      ],
    });
    expect(screen.queryByRole('heading', { name: 'Desbloquear torneio' })).toBeNull();
    expect(await eventually(() => screen.getByRole('heading', { name: 'Novo torneio' }))).toBeTruthy();
  });
});

describe('the first visit and the brand button', () => {
  it('shows the landing page on the first visit, and its buttons go into the app', async () => {
    await show({ landingSeen: false });
    await eventually(() => expect(screen.getByText('landing page')).toBeTruthy());
    LandingStub.last?.start.emit();
    await eventually(() => expect(screen.queryByText('landing page')).toBeNull());
    expect(screen.getByRole('heading', { name: 'Novo torneio' })).toBeTruthy();
  });

  it('opens the saved tournaments from "continue" on the landing page', async () => {
    const { dialogs$ } = await show({ landingSeen: false });
    const open = vi.spyOn(dialogs$, 'openLibrary').mockResolvedValue();
    await eventually(() => expect(LandingStub.last).not.toBeNull());
    LandingStub.last?.resume.emit();
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(screen.queryByText('landing page')).toBeNull();
  });

  it('goes back to the landing page from the brand button when the tournament has not started', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: /SETPOINT/ }));
    expect(await eventually(() => screen.getByText('landing page'))).toBeTruthy();
  });

  it('goes to the overview from the brand button when a schedule exists', async () => {
    const { navigation } = await show({ stored: { ...running(), startedAt: '2026-11-13T10:00:00.000Z' } });
    navigation.setPage('rounds');
    fireEvent.click(await screen.findByRole('button', { name: /SETPOINT/ }));
    await waitFor(() => expect(navigation.page()).toBe('overview'));
  });

  it('goes to setup from the brand button when it started but has no schedule', async () => {
    const { navigation } = await show({
      stored: { ...running(), rounds: [], startedAt: '2026-11-13T10:00:00.000Z' },
    });
    navigation.setPage('settings');
    fireEvent.click(await screen.findByRole('button', { name: /SETPOINT/ }));
    await waitFor(() => expect(navigation.page()).toBe('setup'));
  });
});

describe('keyboard and screen readers', () => {
  it('has a skip button that moves focus to the content', async () => {
    await show({ stored: running() });
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o conteúdo' }));
    expect(document.activeElement).toBe(document.getElementById('main-content'));
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });

  it('puts the screen in the document title and follows the page', async () => {
    const { navigation } = await show({ stored: running() });
    await eventually(() => expect(document.title).toBe('Visão geral · SETPOINT'));
    navigation.setPage('rounds');
    await eventually(() => expect(document.title).toBe('Partidas · SETPOINT'));
  });

  it('titles the lock screen and the landing page', async () => {
    await show({ lockScreen: true });
    await vi.waitFor(() => expect(document.title).toBe('Acesso restrito · SETPOINT'));
    TestBed.resetTestingModule();
    await show({ landingSeen: false });
    await vi.waitFor(() => expect(document.title).toBe('SETPOINT · Beach Tennis'));
  });
});

describe('the first-visit welcome', () => {
  it('opens the profile panel once, and starts the setup tour only after it closes', async () => {
    const { dialogs } = await show({ prompted: false });
    const cue = TestBed.inject(SetupTourCue);
    let cueWhenOpened: boolean | null = null;
    dialogs.open.mockImplementation(() => {
      cueWhenOpened = cue.pending();
      return Promise.resolve(undefined);
    });
    await vi.waitFor(() => expect(dialogs.open).toHaveBeenCalledOnce(), { timeout: 3000 });
    expect(cueWhenOpened).toBe(false);
    await vi.waitFor(() => expect(cue.pending()).toBe(true), { timeout: 3000 });
  });

  it('starts the tour at once when the profile panel was already offered', async () => {
    const { dialogs } = await show({ prompted: true });
    const cue = TestBed.inject(SetupTourCue);
    await vi.waitFor(() => expect(cue.pending()).toBe(true), { timeout: 3000 });
    expect(dialogs.open).not.toHaveBeenCalled();
  });

  it('does not start the tour while the lock screen or the landing page is up', async () => {
    const { dialogs } = await show({ lockScreen: true, landingSeen: false });
    const cue = TestBed.inject(SetupTourCue);
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(cue.pending()).toBe(false);
    expect(dialogs.open).not.toHaveBeenCalled();
  });
});

describe('the top bar, the heading and the nav', () => {
  it('says whose profile it is, with braces left out of the name', async () => {
    const { local } = await show({ stored: running() });
    local.setItem('setpoint.profile.v1', JSON.stringify({ name: 'Ana {{x}}' }));
    TestBed.inject(LocalProfileStore).update({ name: 'Ana {{x}}' });
    expect(
      await eventually(() => screen.getByRole('button', { name: 'Perfil de Ana x · Salvo neste dispositivo' })),
    ).toBeTruthy();
  });

  it('shows the heading of the page and the nav once there is a schedule', async () => {
    const { navigation } = await show({ stored: running() });
    expect(screen.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeTruthy();
    expect(screen.getByText(/^SUPER 8$/)).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(
      [...nav.querySelectorAll('button')].map((button) => button.textContent?.replace(/^\S\s/, '').trim()),
    ).toEqual(['Visão geral', 'Jogadores', 'Partidas', 'Ranking', 'Ajustes']);
    fireEvent.click(screen.getByRole('button', { name: /Partidas/ }));
    expect(navigation.page()).toBe('rounds');
    expect(await screen.findByRole('heading', { level: 1, name: 'Partidas' })).toBeTruthy();
  });

  it('has no nav before there is a schedule', async () => {
    await show();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo torneio' })).toBeTruthy();
  });
});

describe('what the tournament pages ask of the shell', () => {
  it('goes to Ajustes when the tournament is finished, and reports it unless it is a shared one', async () => {
    const { navigation, archive } = await show({ stored: running() });
    const record = vi.spyOn(archive, 'recordMetrics').mockImplementation(() => undefined);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    await requestFromPage({ kind: 'finalized' });
    expect(navigation.page()).toBe('settings');
    expect(record).toHaveBeenCalledOnce();
  });

  it('does not report a finished shared tournament', async () => {
    const { archive, tournament } = await show({ stored: running() });
    tournament.update((state) => ({ ...state, hostingMode: 'shared' }));
    const record = vi.spyOn(archive, 'recordMetrics').mockImplementation(() => undefined);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    await requestFromPage({ kind: 'finalized' });
    expect(record).not.toHaveBeenCalled();
  });

  it('hands a backup file to the lifecycle', async () => {
    const { lifecycle } = await show({ stored: running() });
    const importBackup = vi.spyOn(lifecycle, 'importBackup').mockResolvedValue();
    const file = new File(['{}'], 'backup.json');
    await requestFromPage({ kind: 'importBackup', file });
    expect(importBackup).toHaveBeenCalledWith(file);
  });

  it('starts over, and shows the landing page when the lifecycle says so', async () => {
    const { lifecycle } = await show({ stored: running() });
    const reset = vi.spyOn(lifecycle, 'reset').mockResolvedValue(true);
    await requestFromPage({ kind: 'reset' });
    expect(reset).toHaveBeenCalledOnce();
    expect(await eventually(() => screen.getByText('landing page'))).toBeTruthy();
  });

  it('stays where it is when starting over is cancelled', async () => {
    const { lifecycle } = await show({ stored: running() });
    vi.spyOn(lifecycle, 'reset').mockResolvedValue(false);
    await requestFromPage({ kind: 'reset' });
    await Promise.resolve();
    expect(screen.queryByText('landing page')).toBeNull();
  });

  it('archives a shared tournament without leaving the page', async () => {
    const { lifecycle } = await show({ stored: running() });
    const cancel = vi.spyOn(lifecycle, 'cancelShared').mockResolvedValue(false);
    await requestFromPage({ kind: 'cancelShared' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.queryByText('landing page')).toBeNull();
  });

  it('syncs now, and pauses and resumes the sync', async () => {
    const { sync } = await show({ stored: running() });
    const now = vi.spyOn(sync, 'syncNow').mockImplementation(() => undefined);
    const pause = vi.spyOn(sync, 'setPaused').mockImplementation(() => undefined);
    await requestFromPage({ kind: 'syncNow' });
    await requestFromPage({ kind: 'syncPaused', paused: true });
    expect(now).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledWith(true);
  });

  it('opens "Meus torneios", the landing page, or another page', async () => {
    const { dialogs$, navigation } = await show({ stored: running() });
    const library = vi.spyOn(dialogs$, 'openLibrary').mockResolvedValue();
    await requestFromPage({ kind: 'openLibrary' });
    expect(library).toHaveBeenCalledOnce();
    await requestFromPage({ kind: 'navigate', page: 'ranking' });
    expect(navigation.page()).toBe('ranking');
    await requestFromPage({ kind: 'openLanding' });
    expect(await eventually(() => screen.getByText('landing page'))).toBeTruthy();
  });

  it('draws the schedule when the setup page asks to start', async () => {
    const { lifecycle } = await show();
    const generate = vi.spyOn(lifecycle, 'generateSchedule').mockResolvedValue();
    await eventually(() => expect(SetupStub.last).not.toBeNull());
    SetupStub.last?.start.emit();
    expect(generate).toHaveBeenCalledOnce();
  });
});

describe('messages', () => {
  it('says the previous tournament stays saved after a new version', async () => {
    const fakes = shellFakes();
    const finalMatch = (id: string, finalKind: string) => ({
      id,
      finalKind,
      court: 1,
      teamA: ['p1', 'p2'],
      teamB: ['p3', 'p4'],
      scoreA: 6,
      scoreB: 4,
    });
    const finished = {
      ...running(),
      finishedAt: '2026-11-13T12:00:00.000Z',
      finals: {
        complete: true,
        podiumPlayerIds: [],
        matches: [finalMatch('f1', 'semifinal'), finalMatch('f2', 'championship')],
      },
    };
    fakes.local.setItem(STATE_KEY, JSON.stringify(finished));
    fakes.local.setItem('setpoint.build.v1', 'older-build');
    fakes.local.setItem('setpoint.landing.seen', 'true');
    await render(AppComponent, {
      imports: [translocoTesting()],
      providers: [
        ...fakes.providers,
        { provide: SURVEYS, useValue: new FakeSurveys() },
        { provide: APP_CONFIG, useValue: testConfig({ buildId: 'new-build' }) },
      ],
      componentImports: [
        FormsModule,
        TranslocoPipe,
        PlayerAvatarComponent,
        TournamentStub,
        SetupStub,
        LandingStub,
        DashboardStub,
        SharedViewStub,
      ],
    });
    expect(
      await screen.findByText('Nova versão do SETPOINT. Seu torneio anterior continua salvo em Meus torneios.'),
    ).toBeTruthy();
  });

  it('shows a notice from a page, and closes it', async () => {
    const { tournament } = await show({ stored: running() });
    void tournament;
    const { Notices } = await import('./core/notices');
    TestBed.inject(Notices).show('Placar removido.');
    expect(await screen.findByText('Placar removido.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    await waitFor(() => expect(screen.queryByText('Placar removido.')).toBeNull());
  });

  it('shows a sync error with its words and a way to Ajustes', async () => {
    const { sync, navigation } = await show({ stored: running() });
    sync.fail('conflict');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('O torneio mudou em outro dispositivo.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Ajustes' }));
    expect(navigation.page()).toBe('settings');
  });
});

describe('a shared view', () => {
  it('shows only the shared page: no top bar, no heading, and none of the owner startup', async () => {
    const { connectivity } = await show({ sharedView: true });
    expect(await eventually(() => screen.getByText('shared view'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /SETPOINT/ })).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    // Only the sync service's own connection listener: the shell's reconnect run was not started.
    expect(connectivity.listening()).toBe(1);
  });
});

describe('the theme', () => {
  it('puts the remembered theme on the page at start', async () => {
    const fakes = shellFakes();
    fakes.local.setItem('setpoint.theme.v1', 'dark');
    fakes.local.setItem('setpoint.landing.seen', 'true');
    await render(AppComponent, {
      imports: [translocoTesting()],
      providers: [...fakes.providers, { provide: SURVEYS, useValue: new FakeSurveys() }],
      componentImports: [
        FormsModule,
        TranslocoPipe,
        PlayerAvatarComponent,
        TournamentStub,
        SetupStub,
        LandingStub,
        DashboardStub,
        SharedViewStub,
      ],
    });
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
