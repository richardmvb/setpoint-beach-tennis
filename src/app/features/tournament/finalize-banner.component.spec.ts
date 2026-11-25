import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../public/i18n/organizer/pt-BR.json';
import { CurrentTournament } from '../../core/current-tournament';
import { FinalsService } from '../../core/finals.service';
import type { TournamentState } from '../../core/models';
import { createStandingsMemo } from '../../domain/tournament-view/standings';
import { storedTournament } from '../../testing/tournament-state';
import { translocoTesting } from '../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from './data/tournament.store';
import { FinalizeBannerComponent } from './finalize-banner.component';
import { tournamentFakes } from './tournament.fakes';

beforeEach(() => TestBed.resetTestingModule());

/** Every round and every final scored, or the championship left open. */
function stateWithFinals(scoreChampionship: boolean): TournamentState {
  const base = storedTournament();
  const state = {
    ...base,
    rounds: base.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: 1 })),
    })),
  };
  const finals = new FinalsService();
  const stage = finals.create(createStandingsMemo()(state).all);
  const [champ, third] = stage.matches;
  Object.assign(third, { scoreA: 6, scoreB: 4 });
  if (scoreChampionship) Object.assign(champ, { scoreA: 6, scoreB: 2 });
  return { ...state, finals: finals.updatePodium(stage) };
}

async function show(state: TournamentState) {
  const fakes = tournamentFakes();
  const requests: ShellRequest[] = [];
  await render(FinalizeBannerComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      TestBed.inject(CurrentTournament).set(state);
      TestBed.inject(TournamentStore).requests.subscribe((request) => requests.push(request));
    },
  });
  return { ...fakes, requests, tournament: TestBed.inject(CurrentTournament) };
}

describe('FinalizeBannerComponent', () => {
  it('asks to finish once every final has a score', async () => {
    await show(stateWithFinals(true));
    expect(screen.getByRole('group', { name: 'Torneio pronto para finalizar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finalizar agora' })).toBeTruthy();
  });

  it('stays out of the way while a final is still open', async () => {
    await show(stateWithFinals(false));
    expect(screen.queryByRole('button', { name: 'Finalizar agora' })).toBeNull();
  });

  it('finishes the tournament after the confirmation and tells the shell, then goes away', async () => {
    const { requests, tournament, dialogs } = await show(stateWithFinals(true));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar agora' }));
    await vi.waitFor(() => expect(tournament.state().finishedAt).toBeTruthy());
    expect(dialogs.confirms[0]).toMatchObject({ title: 'Finalizar o torneio?' });
    expect(requests).toContainEqual({ kind: 'finalized' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Finalizar agora' })).toBeNull());
  });

  it('keeps the tournament open when the confirmation is cancelled', async () => {
    const { requests, tournament, dialogs } = await show(stateWithFinals(true));
    dialogs.confirmAnswer = false;
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar agora' }));
    await vi.waitFor(() => expect(dialogs.confirms).toHaveLength(1));
    expect(tournament.state().finishedAt).toBeUndefined();
    expect(requests).toEqual([]);
    expect(screen.getByRole('button', { name: 'Finalizar agora' })).toBeTruthy();
  });
});
