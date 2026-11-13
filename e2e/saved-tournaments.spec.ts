import type { Page } from '@playwright/test';
import { createLocalTournament, expect, test } from './support/fixtures';
import { tournamentFixture } from './support/supabase-mock';

/**
 * "Meus torneios" is the device-side history: every started tournament is kept in localStorage
 * (`setpoint.library.v1` index plus one state per tournament) so a reset, an import or an app update
 * never loses one. These tests describe the behavior that the Phase 4 library extraction must keep.
 */

const INDEX_KEY = 'setpoint.library.v1';
const STATE_PREFIX = 'setpoint.library.v1.state.';

interface LibraryIndex {
  version: number;
  entries: { id: string; name: string; hosting: string; matchesCompleted: number }[];
}

const readIndex = (page: Page): Promise<LibraryIndex | null> =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LibraryIndex) : null;
  }, INDEX_KEY);

async function openLibrary(page: Page) {
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
async function seedTwoTournaments(page: Page): Promise<void> {
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

test.describe('saved tournaments (Meus torneios)', () => {
  test('a started tournament is saved on the device and listed as in use', async ({ page }) => {
    await createLocalTournament(page, 'Torneio Salvo');

    const index = await readIndex(page);
    expect(index?.version).toBe(1);
    expect(index?.entries).toHaveLength(1);
    expect(index?.entries[0]).toMatchObject({ name: 'Torneio Salvo', hosting: 'local' });
    const id = index?.entries[0]?.id ?? '';
    expect(await page.evaluate((key) => localStorage.getItem(key) !== null, STATE_PREFIX + id)).toBe(true);

    const dialog = await openLibrary(page);
    await expect(dialog.getByText('Torneio Salvo')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Em uso' })).toBeVisible();
  });

  test('scores keep the saved copy up to date', async ({ page }) => {
    await createLocalTournament(page, 'Torneio Salvo');
    const inputs = page.locator('input.inline-score');
    await inputs.nth(0).fill('4');
    await inputs.nth(1).fill('2');
    await expect(page.getByText('Placar salvo')).toHaveCount(1);

    await expect.poll(async () => (await readIndex(page))?.entries[0]?.matchesCompleted).toBe(1);
  });

  test('another saved tournament can be opened and replaces the one in use', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');

    const dialog = await openLibrary(page);
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    await dialog
      .getByRole('listitem')
      .filter({ hasText: 'Torneio antigo' })
      .getByRole('button', { name: 'Abrir' })
      .click();

    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (JSON.parse(localStorage.getItem('setpoint.tournament.v1') ?? '{}') as { name?: string }).name,
        ),
      )
      .toBe('Torneio antigo');
    // The tournament that was in use is still in the library.
    expect((await readIndex(page))?.entries.map((entry) => entry.name)).toContain('Fixture v1');
  });

  test('a saved tournament can be deleted after confirming, and the one in use cannot', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');

    const dialog = await openLibrary(page);
    await dialog.getByRole('button', { name: 'Excluir Fixture v1' }).click();
    await expect(page.getByText('Este é o torneio em uso. Inicie outro antes de excluí-lo.')).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveCount(2);

    await dialog.getByRole('button', { name: 'Excluir Torneio antigo' }).click();
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();

    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    await expect(dialog.getByText('Torneio antigo')).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), STATE_PREFIX + 'older-tournament-id')).toBeNull();
    expect((await readIndex(page))?.entries.map((entry) => entry.name)).not.toContain('Torneio antigo');
  });

  test('cancelling the delete keeps the saved tournament', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');

    const dialog = await openLibrary(page);
    await dialog.getByRole('button', { name: 'Excluir Torneio antigo' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(dialog.getByRole('listitem')).toHaveCount(2);
    expect((await readIndex(page))?.entries.map((entry) => entry.name)).toContain('Torneio antigo');
  });

  test('a library index that cannot be read is ignored without breaking the app', async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, '{"version":1,"entries":"broken"'), INDEX_KEY);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });
});
