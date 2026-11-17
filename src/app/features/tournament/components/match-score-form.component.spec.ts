import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { FinalScoreStatus, RoundScoreStatus } from '../../../domain/tournament-play/score-entry';
import { storedTournament } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { MatchScoreFormComponent, type ScoreEdit } from './match-score-form.component';

beforeEach(() => TestBed.resetTestingModule());

async function show(
  status: RoundScoreStatus | FinalScoreStatus,
  extra: { disabled?: boolean; a?: number | null } = {},
) {
  const fakes = tournamentFakes();
  const state = storedTournament();
  const change = vi.fn<(edit: ScoreEdit) => void>();
  await render(MatchScoreFormComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr })],
    providers: [...fakes.providers, TournamentStore],
    inputs: {
      match: state.rounds[0].matches[0],
      a: extra.a ?? null,
      b: null,
      max: 4,
      disabled: extra.disabled ?? false,
      labelA: 'Games da dupla 1',
      labelB: 'Games da dupla 2',
      status,
    },
    on: { scoreChange: change },
    configureTestBed: () => TestBed.inject(CurrentTournament).set(state),
  });
  return { change, state };
}

describe('MatchScoreFormComponent', () => {
  it('shows both pairs by name, VS and one games field for each side', async () => {
    const { state } = await show('fillBoth');
    for (const id of [...state.rounds[0].matches[0].teamA, ...state.rounds[0].matches[0].teamB]) {
      const name = state.players.find((player) => player.id === id)!.name;
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('VS')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Games da dupla 1' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Games da dupla 2' })).toBeTruthy();
  });

  it('says what was typed, and leaves the decision to the page', async () => {
    const { change } = await show('fillBoth');
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Games da dupla 2' });
    fireEvent.input(field, { target: { value: '3' } });
    expect(change).toHaveBeenCalledWith({ side: 'b', value: 3 });
    fireEvent.input(screen.getByRole('spinbutton', { name: 'Games da dupla 1' }), { target: { value: '' } });
    expect(change).toHaveBeenLastCalledWith({ side: 'a', value: null });
  });

  it('disables the fields when the score cannot be edited', async () => {
    await show('saved', { disabled: true });
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Games da dupla 1' }).disabled).toBe(true);
  });

  it.each<[RoundScoreStatus | FinalScoreStatus, string]>([
    ['fillBoth', 'Preencha os dois placares'],
    ['invalid', 'Placar incompleto ou inválido'],
    ['saved', 'Salvo automaticamente'],
    ['updating', 'Atualizando placar'],
    ['resultSaved', 'Resultado salvo'],
    ['tieBreak', 'Tie-break: vencer por 2 pontos'],
    ['enterGames', 'Informe os games do set'],
    ['inProgress', 'Set em andamento · vitória por 2 games'],
  ])('the status %s reads "%s"', async (status, text) => {
    await show(status);
    expect(screen.getByText(text)).toBeTruthy();
  });
});
