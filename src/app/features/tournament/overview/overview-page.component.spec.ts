import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { SharedTournamentSnapshot, TournamentState } from '../../../core/models';
import { OwnedSharedTournament } from '../../../core/owned-shared-tournament';
import { storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { OverviewPageComponent } from './overview-page.component';

beforeEach(() => TestBed.resetTestingModule());

async function show(state: TournamentState, options: { moderator?: boolean } = {}) {
  const fakes = tournamentFakes();
  const requests: ShellRequest[] = [];
  const snapshot: SharedTournamentSnapshot = {
    id: 'shared-1',
    status: 'active',
    capacity: 8,
    state,
    inviteToken: 'invite-1',
    inviteExpiresAt: '2099-01-01T00:00:00Z',
    expiresAt: '2099-02-03T12:00:00Z',
  };
  fakes.shared.givenOwned(snapshot);
  await render(OverviewPageComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(state);
      tournament.connect({ save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() });
      TestBed.inject(OwnedSharedTournament).setModerator(!!options.moderator);
      if (options.moderator) TestBed.inject(OwnedSharedTournament).replaceSnapshot(snapshot);
      TestBed.inject(TournamentStore).requests.subscribe((request) => requests.push(request));
    },
  });
  return { ...fakes, requests, owned: TestBed.inject(OwnedSharedTournament) };
}

describe('OverviewPageComponent', () => {
  it('shows the numbers, the progress and the status of a tournament with a schedule', async () => {
    await show(storedTournament());
    expect(screen.getByText('JOGADORES')).toBeTruthy();
    expect(screen.getByText('Tabela pronta')).toBeTruthy();
    expect(screen.getByText('Registre resultados em qualquer ordem.')).toBeTruthy();
    expect(screen.getByText('Progresso')).toBeTruthy();
    expect(screen.getByText('Tempo de torneio')).toBeTruthy();
    expect(screen.getByText(/Super 8 · 2 quadra\(s\) · 4 games por partida · 7 rodadas/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Link para acompanhar' })).toBeNull();
  });

  it('describes a tournament that is still being prepared and sends the organizer to the players', async () => {
    const { requests } = await show(tournamentState({ createdAt: '2026-11-13T10:00:00.000Z' }));
    expect(screen.getByText('Preparando torneio')).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cadastrar jogadores/ }));
    expect(requests).toEqual([{ kind: 'navigate', page: 'players' }]);
  });

  it('opens the matches', async () => {
    const { requests } = await show(storedTournament());
    fireEvent.click(screen.getByRole('button', { name: /Abrir partidas/ }));
    expect(requests).toEqual([{ kind: 'navigate', page: 'rounds' }]);
  });

  it("shows a shared tournament's moderator the invite card and what happened to the invite", async () => {
    const state = { ...storedTournament(), hostingMode: 'shared' as const, sharedTournamentId: 'shared-1' };
    const { owned, copied } = await show(state, { moderator: true });
    expect(screen.getByText(/TORNEIO COMPARTILHADO · Torneio em andamento/)).toBeTruthy();
    expect(screen.getByText(/Disponível até/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Recuperar link' }));
    expect(await screen.findByText('Novo link de convite criado. O link anterior foi invalidado.')).toBeTruthy();
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link de convite' });
    expect(field.value).toBe('https://app.test/?invite=invite-rotated-1');
    expect(screen.getByRole('button', { name: 'Gerar novo link' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(await screen.findByText('Link copiado.')).toBeTruthy();
    expect(copied).toEqual(['https://app.test/?invite=invite-rotated-1']);
    expect(owned.notice()).toBe('copied');
  });

  it('shows the reason when the invite cannot be renewed', async () => {
    const state = { ...storedTournament(), hostingMode: 'shared' as const, sharedTournamentId: 'shared-1' };
    const { shared } = await show(state, { moderator: true });
    shared.fail('tournament_expired');
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar link' }));
    expect(await screen.findByText('Este torneio compartilhado já expirou.')).toBeTruthy();
  });

  it('asks the shell to cancel the shared tournament', async () => {
    const state = { ...storedTournament(), hostingMode: 'shared' as const, sharedTournamentId: 'shared-1' };
    const { requests } = await show(state, { moderator: true });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar e recomeçar' }));
    expect(requests).toEqual([{ kind: 'cancelShared' }]);
  });

  it('forgets what the setup wizard left behind when it opens', async () => {
    const state = { ...storedTournament(), hostingMode: 'shared' as const, sharedTournamentId: 'shared-1' };
    const { owned } = await show(state, { moderator: true });
    expect(owned.notice()).toBeNull();
    expect(owned.error()).toBeNull();
  });
});
