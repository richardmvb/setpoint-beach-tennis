import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { completeRoundMatches, expect, generateFinals, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * Visual baselines: full-page screenshots of the key pages, light and dark, in e2e/__screenshots__.
 * They are expected output, not a suppression baseline. A change that is meant to be visual regenerates them
 * with `npm run e2e:visual:update` (the Playwright image CI uses) and the PR names each image that changed.
 * A style refactor must pass them unchanged.
 */

/** Fixed so every elapsed-time label reads the same on every run. */
const NOW = new Date('2026-11-12T13:30:00.000Z');

const tournamentJson = readFileSync(
  join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'),
  'utf8',
);

type Theme = 'light' | 'dark';

/** Wait for the web fonts and stop every transition, so the shot is of a settled page. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
}

/**
 * Grow the viewport to the page height before a full-page shot. Otherwise the sticky header and the floating tab bar
 * are pasted over the middle of the content. Two passes, because a taller viewport can change viewport-relative sizes.
 */
async function fitViewportToPage(page: Page): Promise<void> {
  // Start from the default height: scrollHeight never reports less than the viewport, so a page shorter than the last shot would keep its height.
  await page.setViewportSize({ width: 1280, height: 720 });
  for (let pass = 0; pass < 2; pass++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1280, height });
    await page.evaluate(() => document.fonts.ready);
  }
}

async function shot(page: Page, name: string, theme: Theme): Promise<void> {
  await settle(page);
  await fitViewportToPage(page);
  await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`visual baselines (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.addInitScript((mode: Theme) => localStorage.setItem('setpoint.theme.v1', mode), theme);
    });

    test.describe('landing', () => {
      test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });
      test('landing', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
        await shot(page, 'landing', theme);
      });
    });

    test('setup', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
      await shot(page, 'setup', theme);
    });

    test('rounds, ranking and finals', async ({ page }) => {
      test.slow();
      // Start from the stored fixture, not a fresh draw, so the players and fixtures never depend on random calls at load.
      await page.addInitScript((state: string) => {
        if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
      }, tournamentJson);
      await page.goto('/');
      await page
        .getByRole('button', { name: /Partidas/ })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: 'Partidas', exact: true })).toBeVisible();
      await completeRoundMatches(page);
      await shot(page, 'rounds', theme);

      await page.getByRole('button', { name: 'Ranking e finais →' }).first().click();
      await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
      await shot(page, 'ranking', theme);

      await generateFinals(page);
      await shot(page, 'finals', theme);
    });

    test('live viewer', async ({ page }) => {
      const supabase = await mockSupabase(page);
      supabase.rpc('get_local_live_tournament', {
        id: 'live-1',
        status: 'active',
        state: { ...tournamentFixture(), hostingMode: 'local' },
      });
      await page.goto('/?live=live-read-token-123');
      await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Progresso do torneio' })).toBeVisible();
      await shot(page, 'live-viewer', theme);
    });

    test('dashboard login', async ({ page }) => {
      await mockSupabase(page);
      await page.goto('/dashboard');
      await expect(page.getByText('ACESSO RESTRITO')).toBeVisible();
      await shot(page, 'dashboard-login', theme);
    });
  });
}
