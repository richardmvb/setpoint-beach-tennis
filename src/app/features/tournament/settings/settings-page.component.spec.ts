import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { namedPlayers, storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import {
  NO_SHELL_STATE,
  TournamentStore,
  type ShellRequest,
  type TournamentShellState,
} from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { SettingsPageComponent } from './settings-page.component';

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => vi.restoreAllMocks());

async function show(state: TournamentState, shell: Partial<TournamentShellState> = {}) {
  const fakes = tournamentFakes();
  const hooks = { save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() };
  const requests: ShellRequest[] = [];
  await render(SettingsPageComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(state);
      tournament.connect(hooks);
      const store = TestBed.inject(TournamentStore);
      store.shell.set({ ...NO_SHELL_STATE, ...shell });
      store.requests.subscribe((request) => requests.push(request));
    },
  });
  return { ...fakes, hooks, requests, tournament: TestBed.inject(CurrentTournament) };
}

const unscheduled = (overrides: Partial<TournamentState> = {}) =>
  tournamentState({ players: namedPlayers(8), analyticsId: 'a1', ...overrides });

describe('SettingsPageComponent: the rules', () => {
  it('locks the form once the schedule exists', async () => {
    await show(storedTournament());
    expect(screen.getByLabelText<HTMLInputElement>('Nome do torneio').disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Salvar configurações' }).disabled).toBe(true);
    expect(screen.getByText('Bloqueado após gerar a tabela.')).toBeTruthy();
    expect(screen.getByText('Como a tabela é montada')).toBeTruthy();
    expect(screen.getByText('Nenhuma dupla de parceiros se repete.')).toBeTruthy();
  });

  it('saves the name (trimmed) and the rounds of the format, then tells the organizer', async () => {
    const { hooks, tournament, analytics } = await show(unscheduled({ name: '  ', roundCount: 1 }));
    fireEvent.input(screen.getByLabelText('Nome do torneio'), { target: { value: '  Copa do Mar  ' } });
    expect(tournament.state().name).toBe('  Copa do Mar  ');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(tournament.state().name).toBe('Copa do Mar');
    expect(tournament.state().roundCount).toBe(7);
    expect(hooks.save).toHaveBeenCalledWith('Configurações salvas.');
    expect(analytics.calls).toContainEqual(
      expect.objectContaining({ kind: 'capture', event: 'tournament_settings_saved' }),
    );
  });

  it('falls back to a default name when it is blank', async () => {
    const { tournament } = await show(unscheduled({ name: 'x' }));
    fireEvent.input(screen.getByLabelText('Nome do torneio'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(tournament.state().name).toBe('Meu torneio');
  });

  it('refuses to save while there are more athletes than places', async () => {
    const { hooks, tournament } = await show(unscheduled({ players: namedPlayers(9), roundCount: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(hooks.notify).toHaveBeenCalledWith('Remova participantes até ficar com 8.', 'error');
    expect(hooks.save).not.toHaveBeenCalled();
    expect(tournament.state().roundCount).toBe(1);
  });

  it('shows the group rules and the readonly court count for a group tournament', async () => {
    await show(unscheduled({ tournamentMode: 'groups', groupFormat: 'fixed', courts: 2 }));
    expect(screen.getByText('Duplas fixas: todos contra todos.')).toBeTruthy();
    expect(screen.getByLabelText('Formato dos grupos')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Quadras por rodada').value).toBe('2 quadras');
  });

  it('notes the quick format', async () => {
    await show(unscheduled({ gamesToWin: 3 }));
    expect(screen.getByText('Modo rápido: final e disputa de 3º lugar continuam em 6 games.')).toBeTruthy();
  });
});

describe('SettingsPageComponent: the cards', () => {
  it('shows the final report only for a finished tournament', async () => {
    await show(storedTournament());
    expect(screen.queryByRole('heading', { name: 'Relatório final' })).toBeNull();
    TestBed.resetTestingModule();
    await show({ ...storedTournament(), finishedAt: '2026-11-13T12:00:00.000Z' });
    expect(await screen.findByRole('heading', { name: 'Relatório final' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Link para acompanhar ao vivo' })).toBeNull();
  });

  it('creates and copies the live link of a local tournament', async () => {
    const { published, copied, tournament } = await show(storedTournament());
    expect(screen.queryByText('Online e offline')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar e copiar link' }));
    expect(await screen.findByText('Link copiado. Envie para quem vai acompanhar.')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Link público de acompanhamento' }).value).toBe(
      'https://app.test/?live=read-1',
    );
    expect(published).toHaveLength(1);
    expect(copied).toEqual(['https://app.test/?live=read-1']);
    expect(screen.getByRole('button', { name: 'Copiar link ao vivo' })).toBeTruthy();
    expect(tournament.state().analyticsId).toBeTruthy();
  });

  it('has no live link card for a shared tournament', async () => {
    await show({ ...storedTournament(), hostingMode: 'shared', sharedTournamentId: 's1' });
    expect(screen.queryByRole('heading', { name: 'Link para acompanhar ao vivo' })).toBeNull();
  });

  it('shows the sync card only when sync is available, with its status, the switch and the button', async () => {
    const { requests } = await show(storedTournament(), {
      syncAvailable: true,
      syncStatus: 'pending',
      hasPendingSync: true,
      syncPaused: false,
      online: true,
    });
    expect(screen.getByText(/Aguardando sincronização · Há alterações aguardando envio\./)).toBeTruthy();
    const toggle = screen.getByRole<HTMLInputElement>('checkbox', { name: /Sincronização automática/ });
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(requests).toContainEqual({ kind: 'syncPaused', paused: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    expect(requests).toContainEqual({ kind: 'syncNow' });
  });

  it('disables "Sincronizar agora" while offline, with nothing pending or already syncing, and shows the error', async () => {
    await show(storedTournament(), { syncAvailable: true, syncStatus: 'offline', online: false, syncError: 'Falhou.' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sincronizar agora' }).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Falhou.');
  });

  it('exports the backup and says so', async () => {
    const created = vi.fn(() => 'blob:x');
    URL.createObjectURL = created;
    URL.revokeObjectURL = vi.fn();
    const { hooks } = await show(storedTournament());
    fireEvent.click(screen.getByRole('button', { name: /Exportar backup JSON/ }));
    expect(created).toHaveBeenCalledTimes(1);
    expect(hooks.notify).toHaveBeenCalledWith('Backup JSON exportado.', 'success');
  });

  it('hands the chosen file to the shell and clears the input so the same file can be chosen again', async () => {
    const { requests } = await show(storedTournament());
    const input = screen.getByText(/Importar backup JSON/).querySelector('input') as HTMLInputElement;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    const cleared = vi.fn();
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    Object.defineProperty(input, 'value', { configurable: true, get: () => 'backup.json', set: cleared });
    fireEvent.change(input);
    expect(cleared).toHaveBeenCalledWith('');
    expect(requests).toEqual([{ kind: 'importBackup', file }]);
  });

  it('asks the shell to start over, open the saved tournaments and go back to the landing page', async () => {
    const { requests, saved } = await openWithSaved();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar novo torneio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a página inicial' }));
    fireEvent.click(within(saved).getByRole('button', { name: /Meus torneios \(1\)/ }));
    expect(requests).toEqual([{ kind: 'reset' }, { kind: 'openLanding' }, { kind: 'openLibrary' }]);
  });
});

async function openWithSaved() {
  const shown = await show(storedTournament());
  const { SavedTournaments } = await import('../../../core/saved-tournaments');
  TestBed.inject(SavedTournaments).library.save(storedTournament());
  TestBed.inject(SavedTournaments).refresh();
  const saved = document.body;
  return { ...shown, saved };
}
