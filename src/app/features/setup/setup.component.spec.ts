import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import setupPtBr from '../../../../public/i18n/setup/pt-BR.json';
import { CurrentTournament } from '../../core/current-tournament';
import { SetupProgress } from '../../core/setup-progress';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import { translocoTesting } from '../../testing/transloco-testing';
import { DRIVER_LOADER } from './data/setup-tour';
import { SetupTourCue } from './data/setup-tour-cue';
import { SetupComponent } from './setup.component';
import { setupFakes } from './setup.fakes';

async function open(options: { step?: 1 | 2 | 3; players?: number } = {}) {
  const fakes = setupFakes();
  const started: { steps: { element: string }[] }[] = [];
  const driver = (config: { steps: { element: string }[] }) => {
    started.push(config);
    return { drive: vi.fn(), destroy: vi.fn() };
  };
  const start = vi.fn();
  const cancelShared = vi.fn();
  const view = await render(SetupComponent, {
    imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
    providers: [...fakes.providers, { provide: DRIVER_LOADER, useValue: () => Promise.resolve({ driver }) }],
    on: { start, cancelShared },
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(tournamentState({ players: namedPlayers(options.players ?? 0) }));
      TestBed.inject(SetupProgress).set(options.step ?? 1);
    },
  });
  return { ...fakes, ...view, started, start, cancelShared, cue: TestBed.inject(SetupTourCue) };
}

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => vi.useRealTimers());

describe('SetupComponent', () => {
  it('shows the step the progress says, with the frame of that step', async () => {
    await open({ step: 2, players: 3 });
    expect(await screen.findByRole('heading', { name: 'Inscreva os participantes' })).toBeTruthy();
    expect(screen.getByText('ETAPA 2 DE 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Faltam 5/ }).hasAttribute('disabled')).toBe(true);
  });

  it('"Adicionar jogadores" goes on to step 2', async () => {
    await open();
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar jogadores/ }));
    expect(await screen.findByRole('heading', { name: 'Inscreva os participantes' })).toBeTruthy();
  });

  it('step 3 starts the schedule through its output, and a shared moderator can cancel through another', async () => {
    const { start } = await open({ step: 3, players: 8 });
    fireEvent.click(await screen.findByRole('button', { name: /Gerar tabela e iniciar/ }));
    expect(start).toHaveBeenCalledOnce();
  });

  it('starts the tour when the shell cues it, once the page is on screen', async () => {
    const { started, cue } = await open();
    await screen.findByRole('heading', { name: 'Configure a competição' });
    cue.request();
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0].steps[0].element).toBe('#setupName');
    expect(cue.pending()).toBe(false);
  });

  it('picks the cue up even when it came before the page loaded', async () => {
    const fakes = setupFakes();
    const started: unknown[] = [];
    await render(SetupComponent, {
      imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
      configureTestBed: () => TestBed.inject(SetupTourCue).request(),
      providers: [
        ...fakes.providers,
        {
          provide: DRIVER_LOADER,
          useValue: () =>
            Promise.resolve({
              driver: (config: unknown) => (started.push(config), { drive: vi.fn(), destroy: vi.fn() }),
            }),
        },
      ],
    });
    await waitFor(() => expect(started).toHaveLength(1));
  });

  it('offers the tour of the next step shortly after "next", and not after the page is gone', async () => {
    const { started, fixture } = await open({ step: 1 });
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar jogadores/ }));
    await screen.findByRole('heading', { name: 'Inscreva os participantes' });
    await waitFor(() => expect(started).toHaveLength(1), { timeout: 2000 });
    expect(started[0].steps[0].element).toBe('[data-tour="add-player"]');
    fixture.destroy();
  });

  it('a tour that was due after "next" does not start when the page goes away first', async () => {
    const { started, fixture } = await open({ step: 1 });
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar jogadores/ }));
    await screen.findByRole('heading', { name: 'Inscreva os participantes' });
    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(started).toEqual([]);
  });
});
