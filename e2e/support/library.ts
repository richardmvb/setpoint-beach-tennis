import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { tournamentFixture } from './supabase-mock';

export const INDEX_KEY = 'setpoint.library.v1';
export const STATE_PREFIX = 'setpoint.library.v1.state.';

export async function openLibrary(page: Page) {
  await page.getByRole('button', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: /Ver todos/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Meus torneios' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The tournament in the active slot ("Fixture v1") plus an older one that only exists in the library.
 * Seeded once, so a reload keeps whatever the test changed.
 */
export async function seedTwoTournaments(page: Page): Promise<void> {
  const active = tournamentFixture();
  const older = { ...active, name: 'Torneio antigo', analyticsId: 'older-tournament-id' };
  const entry = {
    id: 'older-tournament-id',
    name: 'Torneio antigo',
    mode: 'super',
    hosting: 'local',
    size: 8,
    playerCount: 8,
    phase: 'qualifying',
    matchesCompleted: 3,
    matchesTotal: 28,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    bytes: JSON.stringify(older).length,
    archivePending: false,
  };
  await page.addInitScript(
    ({ activeState, olderState, olderEntry, indexKey, statePrefix }) => {
      if (localStorage.getItem('setpoint.tournament.v1')) return;
      localStorage.setItem('setpoint.tournament.v1', JSON.stringify(activeState));
      localStorage.setItem(statePrefix + olderEntry.id, JSON.stringify(olderState));
      localStorage.setItem(indexKey, JSON.stringify({ version: 1, entries: [olderEntry] }));
    },
    { activeState: active, olderState: older, olderEntry: entry, indexKey: INDEX_KEY, statePrefix: STATE_PREFIX },
  );
}
