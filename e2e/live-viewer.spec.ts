import { expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * The live viewer is a public read-only page opened from a link a tournament host shares. It reads the
 * tournament by its read token through the `get_local_live_tournament` RPC and refreshes by polling.
 * Phase 4 moves this page to its own feature, so these tests describe the behavior that must not change.
 */

const TOKEN = 'live-read-token-123';

interface Match {
  scoreA: number | null;
  scoreB: number | null;
}

test.describe('live viewer', () => {
  test('opens from the legacy ?live= link and shows the tournament read-only', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_local_live_tournament', {
      id: 'live-1',
      status: 'active',
      state: { ...tournamentFixture(), hostingMode: 'local' },
    });

    await page.goto(`/?live=${TOKEN}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
    await expect(page.getByText('ACOMPANHAMENTO AO VIVO')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Progresso do torneio' })).toBeVisible();
    // A viewer can read the tournament but is never offered the setup wizard or score inputs.
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toHaveCount(0);
    await expect(page.locator('input.inline-score')).toHaveCount(0);
    expect(supabase.calls('get_local_live_tournament')[0]).toEqual({ p_read_token: TOKEN });
  });

  test('picks up a new score from the host without a reload (polling)', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = { ...tournamentFixture(), hostingMode: 'local' } as Record<string, unknown>;
    supabase.rpc('get_local_live_tournament', { id: 'live-1', status: 'active', state });

    await page.goto(`/?live=${TOKEN}`);
    const played = page.locator('.arena-stats > div').first().locator('b');
    await expect(played).toBeVisible();
    const before = Number.parseInt((await played.innerText()).split('/')[0] ?? '0', 10);

    // The host scores one more match; the viewer sees it on its next poll (every 4 seconds).
    const rounds = structuredClone(state['rounds']) as { matches: Match[] }[];
    const next = rounds.flatMap((round) => round.matches).find((match) => match.scoreA === null);
    expect(next, 'fixture has an unscored match').toBeDefined();
    if (next) Object.assign(next, { scoreA: 4, scoreB: 1 });
    supabase.rpc('get_local_live_tournament', { id: 'live-1', status: 'active', state: { ...state, rounds } });

    await expect
      .poll(async () => Number.parseInt((await played.innerText()).split('/')[0] ?? '0', 10), { timeout: 15_000 })
      .toBe(before + 1);
  });

  test('shows a clear message when the link is not valid', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.fail('get_local_live_tournament', 'invalid_live_link');

    await page.goto(`/?live=wrong-token`);

    await expect(page.getByRole('alert')).toHaveText('Este link de acompanhamento não é válido.');
  });

  test('a finished tournament is labelled as such', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_local_live_tournament', {
      id: 'live-1',
      status: 'completed',
      state: { ...tournamentFixture(), hostingMode: 'local' },
    });

    await page.goto(`/?live=${TOKEN}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
    await expect(page.locator('.arena-badge')).not.toHaveClass(/live/);
  });
});
