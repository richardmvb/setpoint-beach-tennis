import { createLocalTournament, expect, test } from './support/fixtures';

/**
 * Smoke test of the production build, served the way GitHub Pages serves it: minified, under the
 * /setpoint-beach-tennis/ base path, with lazy chunks loaded from there (scripts/serve-dist.cjs, Supabase mocked on
 * the same origin). The rest of the suite runs on the dev server, which keeps Angular's dev-mode checks (NG0100,
 * NG0955, NG0956); this file covers what only the production build can break: the base path, deep links, chunk
 * loading and the Content-Security-Policy without dev mode (the fixture fails a test on any CSP violation).
 *
 * Runs only in the `production` projects (`npm run e2e:prod`, CI job `e2e-production`). Addresses are relative
 * (`./`), so they resolve under the base path.
 */

test.describe('production build: first visit', () => {
  test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });

  test('the landing page opens the setup wizard', async ({ page }) => {
    await page.goto('./');

    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
    await page
      .getByRole('button', { name: /Criar meu torneio/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });
});

test.describe('production build: returning organizer', () => {
  test('a local tournament is created, survives a reload and opens the ranking', async ({ page }) => {
    await createLocalTournament(page, 'Torneio Produção', './');

    // A reload restores the stored tournament on its overview page.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    expect(new URL(page.url()).pathname).toMatch(/^\/setpoint-beach-tennis\//);
  });

  test('a deep link to the dashboard loads under the base path', async ({ page }) => {
    await page.goto('./dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('ACESSO RESTRITO')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/setpoint-beach-tennis/dashboard');
  });

  test('a live link shows the shared tournament', async ({ page }) => {
    // scripts/serve-dist.cjs answers get_local_live_tournament with tests/fixtures/persisted/tournament/v1.json.
    await page.goto('./?live=smoke-token');

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
  });
});
