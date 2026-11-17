import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { namedPlayers, storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { PlayersPageComponent } from './players-page.component';

beforeEach(() => TestBed.resetTestingModule());

async function show(state: TournamentState) {
  const fakes = tournamentFakes();
  const requests: ShellRequest[] = [];
  await render(PlayersPageComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(state);
      tournament.connect({ save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() });
      TestBed.inject(TournamentStore).requests.subscribe((request) => requests.push(request));
    },
  });
  return { requests };
}

describe('PlayersPageComponent', () => {
  it('lists the athletes in order and keeps the list locked', async () => {
    await show(storedTournament());
    expect(screen.getByRole('heading', { name: 'Jogadores inscritos' })).toBeTruthy();
    expect(screen.getByText('8 inscritos')).toBeTruthy();
    expect(screen.getByText('Participante 01')).toBeTruthy();
    expect(screen.getByText('Participante 08')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Nome do jogador' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Adicionar' }).disabled).toBe(true);
    for (const remove of screen.getAllByRole('button', { name: 'Remover jogador' }))
      expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Gerar todas as rodadas/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Revisar configurações' }).disabled).toBe(true);
  });

  it('shows an empty state, and the review button works while there is no schedule', async () => {
    const { requests } = await show(tournamentState({ players: namedPlayers(0) }));
    expect(screen.getByText('Nenhum jogador cadastrado')).toBeTruthy();
    expect(screen.getByText('Cadastre 8 jogadores para gerar a tabela.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar configurações' }));
    expect(requests).toEqual([{ kind: 'navigate', page: 'settings' }]);
  });
});
