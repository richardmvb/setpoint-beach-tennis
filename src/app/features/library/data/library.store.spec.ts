import { DIALOG_DATA } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogService } from '../../../core/dialog.service';
import { SavedTournaments } from '../../../core/saved-tournaments';
import { storedTournament } from '../../../testing/tournament-state';
import { libraryFakes } from '../library.fakes';
import { type DeleteTexts, type LibraryDialogData, LibraryStore } from './library.store';

const texts: DeleteTexts = { title: 'Excluir?', text: 'Vai sumir', confirmText: 'Excluir' };

function setup(options: { currentId?: string | null; confirm?: boolean; open?: boolean } = {}) {
  const fakes = libraryFakes();
  const confirm = vi.fn().mockResolvedValue(options.confirm ?? true);
  const open = vi.fn().mockResolvedValue(options.open ?? true);
  const data: LibraryDialogData = { currentId: options.currentId ?? null, open };
  TestBed.configureTestingModule({
    providers: [
      ...fakes.providers,
      LibraryStore,
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogService, useValue: { confirm } },
    ],
  });
  const saved = TestBed.inject(SavedTournaments);
  for (const id of ['a', 'b']) {
    fakes.clock.advance(1000);
    saved.library.save({ ...storedTournament(), name: `Torneio ${id}`, analyticsId: id, hostingMode: 'local' });
  }
  const store = TestBed.inject(LibraryStore);
  return { ...fakes, store, saved, confirm, open };
}

describe('LibraryStore', () => {
  it('lists the saved tournaments, newest first, and reports how many it showed', () => {
    const { store, analytics } = setup();
    expect(store.entries().map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(analytics.calls).toEqual([
      { kind: 'capture', event: 'tournament_library_opened', properties: { entries: 2 } },
    ]);
  });

  it('knows which tournament is in use', () => {
    const { store } = setup({ currentId: 'a' });
    const [b, a] = store.entries();
    expect(store.isCurrent(a)).toBe(true);
    expect(store.isCurrent(b)).toBe(false);
  });

  it('open hands the id to the shell and says whether it opened', async () => {
    const { store, open } = setup();
    await expect(store.open('a')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('a');
    open.mockResolvedValue(false);
    await expect(store.open('a')).resolves.toBe(false);
  });

  it('delete asks first, then removes the tournament and reports it', async () => {
    const { store, confirm, analytics, local } = setup();
    const entry = store.entries()[1];
    await store.remove(entry, texts);
    expect(confirm).toHaveBeenCalledWith({ ...texts, tone: 'danger' });
    expect(store.entries().map((item) => item.id)).toEqual(['b']);
    expect(local.getItem('setpoint.library.v1.state.a')).toBeNull();
    expect(analytics.calls.at(-1)).toEqual({
      kind: 'capture',
      event: 'tournament_library_deleted',
      properties: { phase: entry.phase, hosting_mode: 'local' },
    });
    expect(store.deleteBlocked()).toBe(false);
  });

  it('keeps the tournament when the confirmation is declined', async () => {
    const { store } = setup({ confirm: false });
    await store.remove(store.entries()[0], texts);
    expect(store.entries()).toHaveLength(2);
  });

  it('refuses to delete the tournament in use, without asking', async () => {
    const { store, confirm } = setup({ currentId: 'b' });
    await store.remove(store.entries()[0], texts);
    expect(store.deleteBlocked()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(store.entries()).toHaveLength(2);
    await store.open('a');
    expect(store.deleteBlocked()).toBe(false);
  });
});
