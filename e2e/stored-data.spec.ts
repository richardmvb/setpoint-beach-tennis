import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';
import { mockSupabase } from './support/supabase-mock';

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
  test('an offline queue saved by an earlier release is read and its pending score is sent', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('sync_local_live_tournament', (params) => ({
      id: 'live-1',
      status: 'active',
      state: params['p_state'] as never,
    }));
    const queue = fixture('offline-queue', 1);
    const state = fixture('tournament', 1);
    const { analyticsId } = JSON.parse(state) as { analyticsId: string };
    await page.addInitScript(
      (data: { state: string; queue: string; analyticsId: string }) => {
        if (localStorage.getItem('setpoint.tournament.v1')) return;
        localStorage.setItem('setpoint.tournament.v1', data.state);
        localStorage.setItem(`setpoint.sync.local.${data.analyticsId}`, data.queue);
        localStorage.setItem(
          `setpoint.local.live.${data.analyticsId}`,
          JSON.stringify({ id: 'live-1', readToken: 'read-token-e2e', writeToken: 'write-token-e2e' }),
        );
      },
      { state, queue, analyticsId },
    );

    await page.goto('/');

    await expect.poll(() => supabase.calls('sync_local_live_tournament').length).toBe(1);
    const [call] = supabase.calls('sync_local_live_tournament');
    expect(call?.['p_write_token']).toBe('write-token-e2e');
    const sent = call?.['p_state'] as { rounds: { matches: { scoreA: number | null; scoreB: number | null }[] }[] };
    expect(sent.rounds[0]?.matches[1]).toMatchObject({ scoreA: 4, scoreB: 1 });
    await expect
      .poll(() =>
        page.evaluate(
          (key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { pending?: unknown }).pending,
          `setpoint.sync.local.${analyticsId}`,
        ),
      )
      .toBeNull();
  });

  test('a shared tournament snapshot from the server is shown to a guest', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_shared_tournament', JSON.parse(fixture('shared-snapshot', 1)) as Record<string, unknown>);

    await page.goto('/?invite=' + 'a'.repeat(64));

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
    await expect(page.getByText('TORNEIO COMPARTILHADO')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
