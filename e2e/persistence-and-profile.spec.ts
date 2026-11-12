import { createLocalTournament, expect, test } from './support/fixtures';

interface StoredTournament {
  version: number;
  name: string;
  players: unknown[];
  rounds: { matches: { scoreA: number | null; scoreB: number | null }[] }[];
}

test.describe('local persistence', () => {
  test('a tournament and its scores survive a reload', async ({ page }) => {
    await createLocalTournament(page, 'Persistência E2E');
    const inputs = page.locator('input.inline-score');
    await inputs.nth(0).fill('4');
    await inputs.nth(1).fill('1');
    await expect(page.getByText('Placar salvo')).toHaveCount(1);

    await page.reload();

    await expect(page.getByRole('button', { name: /Partidas/ }).first()).toBeVisible();
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('setpoint.tournament.v1');
      return raw ? (JSON.parse(raw) as StoredTournament) : null;
    });
    expect(stored?.version).toBe(1);
    expect(stored?.name).toBe('Persistência E2E');
    expect(stored?.players).toHaveLength(8);
    expect(stored?.rounds).toHaveLength(7);
    expect(stored?.rounds[0].matches[0]).toMatchObject({ scoreA: 4, scoreB: 1 });
  });
});

test.describe('profile and theme', () => {
  test('the profile name is saved on this device and survives a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Perfil' }).click();
    const name = page.locator('#profileName');
    await name.fill('Richard E2E');
    await name.press('Enter');

    await page.reload();
    await page.getByRole('button', { name: 'Perfil' }).click();
    await expect(page.locator('#profileName')).toHaveValue('Richard E2E');
  });

  test('the dark theme choice is stored and kept after a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Perfil' }).click();
    const dark = page.getByRole('radio', { name: 'Escuro' });
    await dark.click();
    await expect(dark).toHaveAttribute('aria-checked', 'true');

    expect(await page.evaluate(() => localStorage.getItem('setpoint.theme.v1'))).toBe('dark');
    await page.reload();
    await page.getByRole('button', { name: 'Perfil' }).click();
    await expect(page.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('network isolation', () => {
  test('the tests never reach external services', async ({ page, blockedRequests }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    for (const url of blockedRequests) {
      expect(new URL(url).hostname).toMatch(/(supabase\.co|posthog|googleapis\.com|gstatic\.com)$/);
    }
  });
});
