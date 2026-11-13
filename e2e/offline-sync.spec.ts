import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * A local tournament with a live link keeps scoring when the connection drops: edits are staged in the
 * offline queue (`setpoint.sync.local.<id>`) and sent with `sync_local_live_tournament` once the device
 * is back online. Phase 4 moves this logic, so these tests describe the behavior it must keep.
 */

const WRITE_TOKEN = 'write-token-e2e';
const ANALYTICS_ID = String(tournamentFixture()['analyticsId']);
const QUEUE_KEY = `setpoint.sync.local.${ANALYTICS_ID}`;

interface QueueRecord {
  version: number;
  revision: number;
  base: { rounds: { matches: { scoreA: number | null; scoreB: number | null }[] }[] };
  pending: { rounds: { matches: { scoreA: number | null; scoreB: number | null }[] }[] } | null;
}

/** The tournament in use already has a live link on this device (id and tokens stored by an earlier session). */
async function seedLiveTournament(page: Page): Promise<void> {
  await page.addInitScript(
    ({ state, analyticsId, writeToken }) => {
      if (localStorage.getItem('setpoint.tournament.v1')) return;
      localStorage.setItem('setpoint.tournament.v1', JSON.stringify(state));
      localStorage.setItem(
        `setpoint.local.live.${analyticsId}`,
        JSON.stringify({ id: 'live-1', readToken: 'read-token-e2e', writeToken }),
      );
    },
    { state: tournamentFixture(), analyticsId: ANALYTICS_ID, writeToken: WRITE_TOKEN },
  );
}

const readQueue = (page: Page): Promise<QueueRecord | null> =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as QueueRecord) : null;
  }, QUEUE_KEY);

/** Scores the first match that has no result yet, 4 to 1, on the matches page. */
async function scoreNextMatch(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /Partidas/ })
    .first()
    .click();
  const inputs = page.locator('input.inline-score');
  await expect(inputs.first()).toBeVisible();
  // The fixture scored match 1 (4 to 2); the next pair of inputs is match 2.
  await inputs.nth(2).fill('4');
  await inputs.nth(3).fill('1');
  // Scores save on their own once valid. The queue is the proof that it was kept.
  await expect.poll(async () => Boolean((await readQueue(page))?.pending)).toBe(true);
}

test.describe('offline score sync', () => {
  test('a score entered offline is kept on the device and not sent', async ({ page, context }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('sync_local_live_tournament', (params) => ({
      id: 'live-1',
      status: 'active',
      state: params['p_state'] as never,
    }));
    await seedLiveTournament(page);
    await page.goto('/');
    await expect.poll(async () => (await readQueue(page))?.revision).toBe(0);

    await context.setOffline(true);
    await scoreNextMatch(page);

    await expect.poll(async () => Boolean((await readQueue(page))?.pending)).toBe(true);
    const queue = await readQueue(page);
    expect(queue?.version).toBe(1);
    expect(queue?.pending?.rounds[0]?.matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
    expect(queue?.base.rounds[0]?.matches[1]).toMatchObject({ scoreA: null, scoreB: null });
    expect(supabase.calls('sync_local_live_tournament')).toHaveLength(0);
  });

  test('the queued score is sent when the connection comes back', async ({ page, context }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('sync_local_live_tournament', (params) => ({
      id: 'live-1',
      status: 'active',
      state: params['p_state'] as never,
    }));
    await seedLiveTournament(page);
    await page.goto('/');
    await context.setOffline(true);
    await scoreNextMatch(page);
    await expect.poll(async () => Boolean((await readQueue(page))?.pending)).toBe(true);

    await context.setOffline(false);

    await expect.poll(() => supabase.calls('sync_local_live_tournament').length).toBe(1);
    const [call] = supabase.calls('sync_local_live_tournament');
    expect(call?.['p_write_token']).toBe(WRITE_TOKEN);
    const sent = call?.['p_state'] as QueueRecord['base'];
    expect(sent.rounds[0]?.matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
    await expect.poll(async () => (await readQueue(page))?.pending).toBeNull();
    const queue = await readQueue(page);
    expect(queue?.base.rounds[0]?.matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
  });

  test('a conflict keeps the local scores and tells the user', async ({ page, context }) => {
    const supabase = await mockSupabase(page);
    supabase.fail('sync_local_live_tournament', 'sync_conflict');
    await seedLiveTournament(page);
    await page.goto('/');
    await context.setOffline(true);
    await scoreNextMatch(page);
    await context.setOffline(false);

    await expect(page.getByRole('alert')).toContainText('O torneio mudou em outro dispositivo');
    const queue = await readQueue(page);
    expect(queue?.pending?.rounds[0]?.matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
  });
});
