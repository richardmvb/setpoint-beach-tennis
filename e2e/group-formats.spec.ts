import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';
import { mockSupabase } from './support/supabase-mock';

const fixture = (name: string): string => readFileSync(join(__dirname, 'support', name), 'utf8');
const mixed24 = fixture('mixed24.json');
const pairs12 = fixture('pairs12.json');

test.describe('every group format has the ranking board', () => {
  test('mixed doubles of 24: the groups fold, the list has the cut, and every athlete shows a gender', async ({
    page,
  }) => {
    await page.addInitScript((state: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
    }, mixed24);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Ranking geral' })).toBeVisible();
    const groups = page.getByRole('region', { name: 'Grupos' });
    await expect(groups.getByRole('article')).toHaveCount(6);
    await expect(groups.locator('.gender-icon.male')).toHaveCount(12);
    await expect(groups.locator('.gender-icon.female')).toHaveCount(12);
    // The long tables are gone: no "Ranking individual" of 24 rows.
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toHaveCount(0);

    // A group opens and closes in place.
    const toggle = page.getByRole('button', { name: 'Ver a tabela do Grupo A' });
    await toggle.click();
    await expect(page.getByRole('table', { name: 'Tabela do Grupo A' })).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('table', { name: 'Tabela do Grupo A' })).toHaveCount(0);

    // Resumo folds the groups into rows, the first one open.
    await page.getByRole('button', { name: 'Resumo' }).click();
    await expect(page.getByText('vão para a final')).toBeVisible();
    await expect(page.locator('details.group-row')).toHaveCount(6);
    await expect(page.locator('details.group-row[open]')).toHaveCount(1);
  });

  test('fixed pairs of 12: one group of pairs, and the list is of the athletes the finals take', async ({ page }) => {
    await page.addInitScript((state: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
    }, pairs12);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();

    const card = page.getByRole('region', { name: 'Grupos' }).getByRole('article', { name: 'Grupo A' });
    await expect(card.locator('button.ranking-player-button')).toHaveCount(6);
    await expect(card.locator('button.ranking-player-button').first()).toContainText(' + ');
    const race = page.getByRole('article', { name: 'Ranking geral' });
    await expect(race.getByText('LINHA DE CORTE · 8 VAGAS')).toBeVisible();
    // A pair opens its first partner, with the place in the ranking of athletes.
    await card.locator('button.ranking-player-button').first().click();
    await expect(page.getByRole('dialog', { name: /./ }).getByText(/º no ranking geral/)).toBeVisible();
  });
});

test.describe('live view of mixed doubles of 24, on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows one section at a time, so the page is short', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_local_live_tournament', {
      id: 'live-m24',
      status: 'active',
      state: JSON.parse(mixed24),
    });
    await page.goto('/?live=live-read-token-123');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture Grupos 24 mistos' })).toBeVisible();

    const pageHeight = (): Promise<number> => page.evaluate(() => document.documentElement.scrollHeight);
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('button', { name: 'Partidas' })).toHaveAttribute('aria-current', 'page');
    // No finals yet: that button waits.
    await expect(nav.getByRole('button', { name: 'Finais' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Ranking geral' })).toHaveCount(0);
    expect(await pageHeight()).toBeLessThan(1400);

    await nav.getByRole('button', { name: 'Ranking' }).click();
    await expect(nav.getByRole('button', { name: 'Ranking' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Quem vai para a final' })).toBeVisible();
    // It was 3,800 px of six tables and a list of 24 before.
    expect(await pageHeight()).toBeLessThan(2300);

    await nav.getByRole('button', { name: 'Partidas' }).click();
    await expect(page.getByRole('heading', { name: 'Quem vai para a final' })).toHaveCount(0);
  });
});
