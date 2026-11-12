import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * Compatibility contract: every release must read the data that earlier releases stored on the device.
 * The fixtures in tests/fixtures/persisted/ are real states captured from the app and are never edited.
 * When the stored shape changes, add a new version file and keep the old ones, so they keep migrating.
 */
const fixture = (kind: string, version: number): string =>
  readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', kind, `v${version}.json`), 'utf8');

test.describe('stored data from earlier releases', () => {
  test('a v1 tournament saved on the device loads with its players, rounds and saved score', async ({ page }) => {
    const raw = fixture('tournament', 1);
    await page.addInitScript((state: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
    }, raw);

    await page.goto('/');
    await page
      .getByRole('button', { name: /Partidas/ })
      .first()
      .click();

    await expect(page.locator('.round-tabs button')).toHaveCount(7);
    const inputs = page.locator('input.inline-score');
    await expect(inputs.nth(0)).toHaveValue('4');
    await expect(inputs.nth(1)).toHaveValue('2');

    await page
      .getByRole('button', { name: /Jogadores/ })
      .first()
      .click();
    for (const name of ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fabio', 'Gabi', 'Hugo']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('stored data that cannot be read is discarded without breaking the app', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('setpoint.tournament.v1', '{"version":1,"players":"broken"'));

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });
});
