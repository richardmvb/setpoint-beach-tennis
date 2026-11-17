import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentTournament } from '../core/current-tournament';
import { Notices } from '../core/notices';
import { SetupTourCue } from '../features/setup/data/setup-tour-cue';
import { shellFakes } from '../testing/shell-fakes';
import { storedTournament } from '../testing/tournament-state';
import { translocoTesting } from '../testing/transloco-testing';
import { ShellDialogs } from './shell-dialogs';
import { TournamentLifecycle } from './tournament-lifecycle';

function setup() {
  const fakes = shellFakes();
  TestBed.configureTestingModule({ imports: [translocoTesting()], providers: fakes.providers });
  TestBed.inject(CurrentTournament).set({ ...storedTournament(), hostingMode: 'local', analyticsId: 'a1' });
  const lifecycle = TestBed.inject(TournamentLifecycle);
  const openSaved = vi.spyOn(lifecycle, 'openSaved').mockResolvedValue(true);
  return {
    ...fakes,
    ui: TestBed.inject(ShellDialogs),
    notices: TestBed.inject(Notices),
    cue: TestBed.inject(SetupTourCue),
    openSaved,
  };
}

beforeEach(() => {
  TestBed.resetTestingModule();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('the profile panel', () => {
  it('opens as a popover with what the shell knows, and is open until it closes', async () => {
    const { ui, ...fakes } = setup();
    let release: (value: unknown) => void = () => undefined;
    fakes.dialogs.open.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const opening = ui.openProfile();
    await vi.waitFor(() => expect(fakes.dialogs.open).toHaveBeenCalledOnce());
    expect(ui.profileOpen()).toBe(true);
    const [, options] = fakes.dialogs.open.mock.calls[0] as unknown as [
      unknown,
      { data: Record<string, unknown>; id: string },
    ];
    expect(options).toMatchObject({ id: 'profilePanel', autoFocus: 'dialog' });
    expect(options.data).toMatchObject({ welcome: false, currentLibraryId: 'a1' });
    expect(typeof options.data['setTheme']).toBe('function');
    await ui.openProfile();
    expect(fakes.dialogs.open).toHaveBeenCalledOnce();
    release(undefined);
    await opening;
    expect(ui.profileOpen()).toBe(false);
  });

  it('asks the shell to change the theme', async () => {
    const { ui, ...fakes } = setup();
    await ui.openProfile();
    const [, options] = fakes.dialogs.open.mock.calls[0] as unknown as [
      unknown,
      { data: { setTheme(mode: string): void } },
    ];
    options.data.setTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    delete document.documentElement.dataset['theme'];
  });

  it('goes on to "Meus torneios" or to a saved tournament when the panel says so', async () => {
    const { ui, openSaved, ...fakes } = setup();
    fakes.dialogs.open.mockResolvedValueOnce({ kind: 'library' });
    await ui.openProfile();
    await vi.waitFor(() => expect(fakes.dialogs.open).toHaveBeenCalledTimes(2));
    fakes.dialogs.open.mockResolvedValueOnce({ kind: 'open', id: 'x1' });
    await ui.openProfile();
    expect(openSaved).toHaveBeenCalledWith('x1');
  });

  it('lets what waited for the first-visit panel go on a moment after it closes', async () => {
    const { ui } = setup();
    const after = vi.fn();
    await ui.openProfile(true, after);
    expect(after).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(after).toHaveBeenCalledOnce();
  });

  it('forgets the setup tour cue while the panel is on screen', async () => {
    const { ui, cue } = setup();
    cue.request();
    await ui.openProfile();
    expect(cue.pending()).toBe(false);
  });

  it('says so, and still lets the first-visit flow go on, when the panel cannot load', async () => {
    const { ui, notices, ...fakes } = setup();
    fakes.dialogs.open.mockRejectedValueOnce(new Error('chunk'));
    const after = vi.fn();
    await ui.openProfile(true, after);
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'profileFailed' });
    expect(after).toHaveBeenCalledOnce();
    expect(ui.profileOpen()).toBe(false);
  });
});

describe('"Meus torneios"', () => {
  it('opens once at a time and opens a saved tournament through the lifecycle', async () => {
    const { ui, openSaved, ...fakes } = setup();
    let release: (value: unknown) => void = () => undefined;
    fakes.dialogs.open.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const opening = ui.openLibrary();
    await vi.advanceTimersByTimeAsync(0);
    await ui.openLibrary();
    expect(fakes.dialogs.open).toHaveBeenCalledOnce();
    const [, options] = fakes.dialogs.open.mock.calls[0] as unknown as [
      unknown,
      { data: { currentId: string; open(id: string): Promise<boolean> } },
    ];
    expect(options.data.currentId).toBe('a1');
    expect(await options.data.open('b2')).toBe(true);
    expect(openSaved).toHaveBeenCalledWith('b2');
    release(undefined);
    await opening;
    fakes.dialogs.open.mockResolvedValueOnce(undefined);
    await ui.openLibrary();
    expect(fakes.dialogs.open).toHaveBeenCalledTimes(2);
  });

  it('says so when it cannot load, and can be tried again', async () => {
    const { ui, notices, ...fakes } = setup();
    fakes.dialogs.open.mockRejectedValueOnce(new Error('chunk'));
    await ui.openLibrary();
    expect(notices.notice()).toMatchObject({ tone: 'error', key: 'libraryFailed' });
    await ui.openLibrary();
    expect(fakes.dialogs.open).toHaveBeenCalledTimes(2);
  });
});
