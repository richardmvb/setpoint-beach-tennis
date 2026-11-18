import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { namedPlayers, tournamentState, storedTournament } from '../../../testing/tournament-state';
import { groups20State, strongerPairWins } from '../../../testing/groups20';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { RoundsPageComponent } from './rounds-page.component';

beforeEach(() => TestBed.resetTestingModule());

async function show(state: TournamentState = storedTournament()) {
  const fakes = tournamentFakes();
  const hooks = fakes.hooks;
  const requests: ShellRequest[] = [];
  await render(RoundsPageComponent, {
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

describe('RoundsPageComponent', () => {
  it('without a schedule it says so and sends the organizer to the players', async () => {
    const { requests } = await show(tournamentState({ players: namedPlayers(4) }));
    expect(screen.getByRole('heading', { name: 'Tabela não gerada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir para jogadores' }));
    expect(requests).toEqual([{ kind: 'navigate', page: 'players' }]);
  });

  it('shows the calendar, the tabs and the first round with its matches', async () => {
    await show();
    expect(screen.getByRole('heading', { name: 'Calendário' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('1');
    expect(screen.getByText('RODADA 1 DE 7')).toBeTruthy();
    expect(screen.getByText('2 partidas')).toBeTruthy();
    expect(screen.getByText('1 / 2 resultados')).toBeTruthy();
    expect(screen.getAllByText('QUADRA 1').length).toBeGreaterThan(0);
    expect(screen.getByText('● Registrado')).toBeTruthy();
    expect(screen.getByText('○ Pendente')).toBeTruthy();
  });

  it('records a score typed in the two fields', async () => {
    const { tournament, hooks } = await show();
    const fields = screen.getAllByRole<HTMLInputElement>('spinbutton');
    // The first match is scored already; the second one is empty.
    fireEvent.input(fields[2], { target: { value: '4' } });
    fireEvent.input(fields[3], { target: { value: '1' } });
    expect(tournament.state().rounds[0].matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
    expect(hooks.save).toHaveBeenCalledOnce();
    expect(await screen.findAllByText('Placar salvo')).toHaveLength(2);
  });

  it('removes a saved score after the confirmation', async () => {
    const { tournament } = await show();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    await vi.waitFor(() => expect(tournament.state().rounds[0].matches[0].scoreA).toBeNull());
  });

  it('changes the round from a tab', async () => {
    await show();
    fireEvent.click(screen.getAllByRole('tab')[3]);
    expect(await screen.findByText('RODADA 4 DE 7')).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('4');
  });

  it('locks the fields once the finals exist', async () => {
    await show({ ...storedTournament(), finals: { matches: [], complete: false, podiumPlayerIds: [] } });
    for (const field of screen.getAllByRole<HTMLInputElement>('spinbutton')) expect(field.disabled).toBe(true);
    expect(screen.getByText('Bloqueadas após as finais.')).toBeTruthy();
  });

  describe('with fewer courts than matches per round (20 players)', () => {
    const queued = () => ({ ...groups20State(4, 3), courts: 3 });

    it('hides the drawn court and lists every match in one open list', async () => {
      await show(queued());
      expect(screen.queryByText(/QUADRA \d/)).toBeNull();
      expect(screen.getAllByText(/Grupo [A-E] · RODADA 1/).length).toBe(5);
      fireEvent.click(screen.getByRole('button', { name: 'Todos os jogos' }));
      expect(screen.getByRole('heading', { name: '15 jogos' })).toBeTruthy();
      expect(screen.queryByRole('tablist')).toBeNull();
      fireEvent.change(screen.getByLabelText('Grupo'), {
        target: { value: screen.getByRole<HTMLOptionElement>('option', { name: 'Grupo B' }).value },
      });
      expect(screen.getByRole('heading', { name: '3 jogos' })).toBeTruthy();
    });

    it('lists every match by default and only the pending ones when asked', async () => {
      const state = groups20State(4, 3, strongerPairWins);
      await show({
        ...state,
        courts: 3,
        rounds: state.rounds.map((round, index) =>
          index === 0
            ? { ...round, matches: round.matches.map((match) => ({ ...match, scoreA: null, scoreB: null })) }
            : round,
        ),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Todos os jogos' }));
      expect(screen.getByRole('heading', { name: '15 jogos' })).toBeTruthy();
      const box = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Só pendentes' });
      await waitFor(() => expect(box.checked).toBe(false));
      fireEvent.click(box);
      expect(screen.getByRole('heading', { name: '5 jogos' })).toBeTruthy();
    });

    it('has no toggle when every group has its own court', async () => {
      await show({ ...groups20State(4, 3), courts: 5 });
      expect(screen.queryByRole('button', { name: 'Todos os jogos' })).toBeNull();
      expect(screen.getAllByText(/Grupo [A-E] · QUADRA \d/).length).toBeGreaterThan(0);
    });
  });
});
