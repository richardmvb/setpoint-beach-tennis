import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import libraryPtBr from '../../../../public/i18n/library/pt-BR.json';
import tournamentPtBr from '../../../../public/i18n/tournament/pt-BR.json';
import { DialogService } from '../../core/dialog.service';
import { SavedTournaments } from '../../core/saved-tournaments';
import { storedTournament } from '../../testing/tournament-state';
import { translocoTesting } from '../../testing/transloco-testing';
import { LIBRARY_TITLE_ID, LibraryDialogComponent } from './library-dialog.component';
import { libraryFakes } from './library.fakes';

/** Saves one tournament per id, a minute apart, so the last id is the newest. */
async function setup(options: { ids?: string[]; currentId?: string | null; open?: boolean; confirm?: boolean } = {}) {
  const fakes = libraryFakes();
  const close = vi.fn();
  const open = vi.fn().mockResolvedValue(options.open ?? true);
  const confirm = vi.fn().mockResolvedValue(options.confirm ?? true);
  await render(LibraryDialogComponent, {
    imports: [translocoTesting({ 'library/pt-BR': libraryPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      ...fakes.providers,
      { provide: DIALOG_DATA, useValue: { currentId: options.currentId ?? null, open } },
      { provide: DialogRef, useValue: { close } },
      { provide: DialogService, useValue: { confirm } },
    ],
    configureTestBed: () => {
      const saved = TestBed.inject(SavedTournaments);
      for (const id of options.ids ?? []) {
        fakes.clock.advance(60_000);
        saved.library.save({ ...storedTournament(), name: `Torneio ${id}`, analyticsId: id, hostingMode: 'local' });
      }
    },
  });
  return { ...fakes, close, open, confirm };
}

describe('LibraryDialogComponent', () => {
  it('is titled "Meus torneios" and says so when nothing is saved', async () => {
    await setup();
    expect(screen.getByRole('heading', { name: 'Meus torneios' }).id).toBe(LIBRARY_TITLE_ID);
    expect(screen.getByText('NESTE DISPOSITIVO')).toBeTruthy();
    expect(
      screen.getByText('Nenhum torneio salvo ainda. Ele aparece aqui assim que a tabela for gerada.'),
    ).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('the close button closes the dialog', async () => {
    const { close } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(close).toHaveBeenCalled();
  });

  it('lists each tournament, newest first, with phase, progress, players and date', async () => {
    await setup({ ids: ['a', 'b'] });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Torneio b')).toBeTruthy();
    const details = items[0].querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim();
    // The time of day follows the machine's time zone.
    expect(details).toMatch(/^Em andamento · 1\/14 partidas · 8 jogadores · 13\/11\/2026 \d\d:\d\d$/);
  });

  it('opens a tournament and closes when the shell opened it', async () => {
    const { open, close } = await setup({ ids: ['a', 'b'] });
    fireEvent.click(within(screen.getAllByRole('listitem')[1]).getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(open).toHaveBeenCalledWith('a');
  });

  it('stays open when the shell did not open it (a confirmation was declined)', async () => {
    const { open, close } = await setup({ ids: ['a', 'b'], open: false });
    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
  });

  it('marks the tournament in use', async () => {
    await setup({ ids: ['a', 'b'], currentId: 'b' });
    const [current, other] = screen.getAllByRole('listitem');
    expect(current.classList.contains('current')).toBe(true);
    expect(within(current).getByRole('button', { name: 'Em uso' })).toBeTruthy();
    expect(within(other).getByRole('button', { name: 'Abrir' })).toBeTruthy();
  });

  it('deletes after a confirmation that names the tournament', async () => {
    const { confirm } = await setup({ ids: ['a', 'b'] });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Torneio a' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(confirm).toHaveBeenCalledWith({
      title: 'Excluir este torneio salvo?',
      text: '“Torneio a” será removido deste dispositivo. A cópia já enviada à nuvem não é apagada.',
      confirmText: 'Excluir',
      tone: 'danger',
    });
    expect(screen.queryByText('Torneio a')).toBeNull();
  });

  it('says why the tournament in use cannot be deleted, without asking', async () => {
    const { confirm } = await setup({ ids: ['a', 'b'], currentId: 'b' });
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Torneio b' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Este é o torneio em uso. Inicie outro antes de excluí-lo.');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
