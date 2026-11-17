import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { FinalsService } from '../../../core/finals.service';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import { storedTournament } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { RankingPageComponent } from './ranking-page.component';

beforeEach(() => TestBed.resetTestingModule());

function played(): TournamentState {
  const state = storedTournament();
  let index = 0;
  return {
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: index++ % 4 })),
    })),
  };
}

/** The finals of the played tournament, with the given scores on the championship and the third-place match. */
function withFinals(champion: [number, number] | null, third: [number, number] | null): TournamentState {
  const state = played();
  const finals = new FinalsService();
  const stage = finals.create(createStandingsMemo()(state).all);
  const [champ, thirdPlace] = stage.matches;
  if (champion) Object.assign(champ, { scoreA: champion[0], scoreB: champion[1] });
  if (third) Object.assign(thirdPlace, { scoreA: third[0], scoreB: third[1] });
  return { ...state, finals: finals.updatePodium(stage) };
}

async function show(state: TournamentState) {
  const fakes = tournamentFakes();
  const hooks = fakes.hooks;
  const requests: ShellRequest[] = [];
  await render(RankingPageComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(state);
      TestBed.inject(TournamentStore).requests.subscribe((request) => requests.push(request));
    },
  });
  return { ...fakes, hooks, requests, tournament: TestBed.inject(CurrentTournament) };
}

describe('RankingPageComponent', () => {
  it('shows the individual ranking and the tie-break rules', async () => {
    await show(played());
    expect(screen.getByRole('heading', { name: 'Ranking individual' })).toBeTruthy();
    expect(screen.getByText('DESEMPATE')).toBeTruthy();
    expect(screen.getByText('Saldo de games')).toBeTruthy();
  });

  it('offers the finals once every match is played, and generates them', async () => {
    const { tournament, hooks } = await show(played());
    expect(screen.getByRole('heading', { name: 'Oito classificados' })).toBeTruthy();
    expect(screen.getByText('1º+3º × 2º+4º decidem o título; 5º+7º × 6º+8º, o 3º lugar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar finais' }));
    await vi.waitFor(() => expect(tournament.state().finals).toBeTruthy());
    expect(hooks.save).toHaveBeenCalledWith('Finais geradas com base nos oito primeiros do ranking.');
    expect(await screen.findByRole('heading', { name: 'Finais' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gerar finais' })).toBeNull();
  });

  it('does not offer the finals while a match is open', async () => {
    await show(storedTournament());
    expect(screen.queryByRole('button', { name: 'Gerar finais' })).toBeNull();
  });

  it('shows each final with its kind and status, and scores one by typing the games', async () => {
    const { tournament } = await show(withFinals(null, null));
    expect(screen.getByText('FINAL')).toBeTruthy();
    expect(screen.getByText('DISPUTA DE 3º LUGAR')).toBeTruthy();
    expect(screen.getAllByText('○ Pendente')).toHaveLength(2);
    const [champA, champB] = screen.getAllByRole<HTMLInputElement>('spinbutton', { name: /na final/ });
    fireEvent.input(champA, { target: { value: '6' } });
    fireEvent.input(champB, { target: { value: '2' } });
    expect(tournament.state().finals?.matches[0]).toMatchObject({ scoreA: 6, scoreB: 2 });
    expect(await screen.findByText('● Registrado')).toBeTruthy();
    expect(screen.getByText('Resultado salvo')).toBeTruthy();
  });

  it('shows the tie-break fields at 6 to 6', async () => {
    await show(withFinals([6, 6], null));
    expect(screen.getByText('Tie-break')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Pontos de tie-break da dupla 1' })).toBeTruthy();
    expect(screen.getByText('Tie-break: vencer por 2 pontos')).toBeTruthy();
  });

  it('switches the championship to point by point', async () => {
    const { tournament } = await show(withFinals(null, null));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar ponto a ponto' }));
    await vi.waitFor(() => expect(tournament.state().finals?.matches[0].livePoints).toEqual([]));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar ponto à dupla 1' }));
    expect(tournament.state().finals?.matches[0].livePoints).toEqual(['A']);
    expect(screen.getByText('PONTO A PONTO')).toBeTruthy();
  });

  it('shows the podium, the athlete picker and the finish button once the finals are complete', async () => {
    await show(withFinals([6, 2], [6, 4]));
    expect(screen.getByText('PÓDIO FINAL')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finalizar torneio' })).toBeTruthy();
    const picker = screen.getByRole('radiogroup', { name: 'Atleta para gerar a imagem' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(8);
    const make = screen.getByRole<HTMLButtonElement>('button', { name: 'Selecione um atleta' });
    expect(make.disabled).toBe(true);
    fireEvent.click(within(picker).getAllByRole('radio')[0]);
    expect(await screen.findByRole('button', { name: /^Gerar imagem de / })).toBeTruthy();
  });

  it('finishing the tournament asks the shell to react', async () => {
    const { requests, tournament } = await show(withFinals([6, 2], [6, 4]));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar torneio' }));
    await vi.waitFor(() => expect(tournament.state().finishedAt).toBeTruthy());
    expect(requests).toContainEqual({ kind: 'finalized' });
    expect(await screen.findByText(/Duração do torneio:/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finalizar torneio' })).toBeNull();
  });
});
