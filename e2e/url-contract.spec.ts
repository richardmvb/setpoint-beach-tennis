import { createLocalTournament, expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * The app's URL shapes (ADR 0005). Every link already shared must keep working, and the links the app makes must
 * keep their shape. These tests describe the contract that both URL implementations (the original and the router)
 * must satisfy, so they say nothing about how the URLs are handled. `?live=` and `?invite=` have their own specs
 * (live-viewer, shared-invite).
 */

const SIGN_IN_RETURN = '#access_token=e2e-token&refresh_token=e2e-refresh&token_type=bearer&expires_in=3600';

test.describe('admin dashboard URL', () => {
  test('/dashboard asks for an authorized e-mail', async ({ page }) => {
    await mockSupabase(page);

    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('ACESSO RESTRITO')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
  });

  test('a trailing slash is the same page', async ({ page }) => {
    await mockSupabase(page);

    await page.goto('/dashboard/');

    await expect(page.getByText('ACESSO RESTRITO')).toBeVisible();
  });

  test('the e-mail sign-in link sends the moderator back to /dashboard, with no query or hash', async ({ page }) => {
    const supabase = await mockSupabase(page);
    await page.goto('/dashboard');

    await page.getByLabel('E-mail').fill('admin@example.com');
    await page.getByRole('button', { name: 'Enviar link de acesso' }).click();

    await expect.poll(() => supabase.loginRequests().length).toBe(1);
    const [request] = supabase.loginRequests();
    expect(request?.email).toBe('admin@example.com');
    const redirect = new URL(request?.redirectTo ?? '');
    expect(redirect.pathname).toBe('/dashboard');
    expect(redirect.search).toBe('');
    expect(redirect.hash).toBe('');
  });

  test('an admin link opens that tournament (?dashboardTournament=&source=)', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_dashboard_tournament', {
      id: 't1',
      status: 'active',
      state: { ...tournamentFixture(), hostingMode: 'local' },
    });

    await page.goto('/?dashboardTournament=t1&source=local');

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
    expect(supabase.calls('get_dashboard_tournament')[0]).toEqual({ p_source: 'local', p_tournament_id: 't1' });
  });

  test('an admin link with an unknown source says it is unavailable', async ({ page }) => {
    await mockSupabase(page);

    await page.goto('/?dashboardTournament=t1&source=other');

    await expect(page.getByRole('alert')).toHaveText('Visualização administrativa indisponível.');
  });
});

test.describe('links the app makes', () => {
  test('the live link is the app root with only ?live=', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('create_local_live_tournament', { id: 'live-1', readToken: 'read-token-e2e', writeToken: 'w-token' });
    await createLocalTournament(page);
    await page.getByRole('button', { name: 'Ajustes' }).first().click();

    await page.getByRole('button', { name: 'Gerar e copiar link' }).click();

    const link = new URL(await page.getByLabel('Link público de acompanhamento').inputValue());
    expect(link.pathname).toBe('/');
    expect(link.search).toBe('?live=read-token-e2e');
    expect(link.hash).toBe('');
  });
});

test.describe('addresses the app should tolerate', () => {
  test('unknown parameters are ignored', async ({ page }) => {
    await page.goto('/?utm_source=newsletter&foo=bar');

    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });

  test('a sign-in return on / is handled and its tokens are removed from the address', async ({ page }) => {
    await mockSupabase(page);

    await page.goto(`/${SIGN_IN_RETURN}`);

    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(page.url()).not.toContain('access_token');
  });

  test('a sign-in return on /dashboard stays on /dashboard with the tokens removed', async ({ page }) => {
    await mockSupabase(page);

    await page.goto(`/dashboard${SIGN_IN_RETURN}`);

    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).pathname).toBe('/dashboard');
    expect(page.url()).not.toContain('access_token');
  });

  test('the tokens do not come back after the app has settled', async ({ page }) => {
    await mockSupabase(page);
    await page.goto(`/dashboard${SIGN_IN_RETURN}`);
    await expect.poll(() => new URL(page.url()).hash).toBe('');

    await page.waitForTimeout(1500);

    expect(page.url()).not.toContain('access_token');
    expect(await page.evaluate(() => window.history.length)).toBeGreaterThan(0);
  });
});
