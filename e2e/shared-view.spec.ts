import { expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * The shared view (live link, invite, admin viewer) is its own feature since Phase 4. These tests cover what the
 * extraction fixed and what moved with it: the viewer never reads or changes the device's own tournament, it stops
 * listening once the tournament can no longer change, the guest's bottom bar and "Meu caminho", the admin viewer's
 * refresh, and the host's projection (which now shares its code with the guest's).
 */

type Json = Record<string, unknown>;
interface Match {
  scoreA: number | null;
  scoreB: number | null;
}

/** The fixture with round 1 fully played, as a shared tournament with the projection turned on. */
function projectionState(): Json {
  const state = tournamentFixture();
  const rounds = structuredClone(state['rounds']) as { matches: Match[] }[];
  Object.assign(rounds[0].matches[1], { scoreA: 4, scoreB: 1 });
  return { ...state, rounds, hostingMode: 'shared', qualificationStats: true, sharedTournamentId: 'shared-1' };
}

/** The same state with one more match played. */
function withOneMoreScore(state: Json): Json {
  const rounds = structuredClone(state['rounds']) as { matches: Match[] }[];
  const next = rounds.flatMap((round) => round.matches).find((match) => match.scoreA === null);
  if (next) Object.assign(next, { scoreA: 4, scoreB: 2 });
  return { ...state, rounds };
}

/** Puts data on the device before the app starts (only once, so a reload keeps what the app wrote). */
async function seedStorage(page: import('@playwright/test').Page, items: Record<string, string>): Promise<void> {
  await page.addInitScript((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries))
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, items);
}

test.describe('shared view: the device keeps its own tournament', () => {
  test('a ?live= link shows that tournament, even when this device publishes its own live link', async ({ page }) => {
    const own = tournamentFixture();
    const analyticsId = String(own['analyticsId']);
    await seedStorage(page, {
      'setpoint.tournament.v1': JSON.stringify(own),
      [`setpoint.local.live.${analyticsId}`]: JSON.stringify({
        id: 'own-live',
        readToken: 'own-token',
        writeToken: 'w',
      }),
    });
    const supabase = await mockSupabase(page);
    supabase.rpc('get_local_live_tournament', (params) => ({
      id: params['p_read_token'] === 'their-token' ? 'their-live' : 'own-live',
      status: 'active',
      state: { ...own, name: params['p_read_token'] === 'their-token' ? 'Torneio de outra pessoa' : 'Meu torneio' },
    }));

    await page.goto('/?live=their-token');

    await expect(page.getByRole('heading', { level: 1, name: 'Torneio de outra pessoa' })).toBeVisible();
    const tokens = supabase.calls('get_local_live_tournament').map((call) => call['p_read_token']);
    expect(tokens.length).toBeGreaterThan(0);
    expect(new Set(tokens)).toEqual(new Set(['their-token']));
  });

  test('opening an invite after an update does not clear the finished tournament saved here', async ({ page }) => {
    const finished = JSON.stringify({ ...tournamentFixture(), finishedAt: '2026-11-12T15:00:00.000Z' });
    await seedStorage(page, { 'setpoint.tournament.v1': finished, 'setpoint.build.v1': 'an-older-build' });
    const supabase = await mockSupabase(page);
    supabase.rpc('get_shared_tournament', {
      id: 'shared-1',
      status: 'registration',
      capacity: 8,
      state: { ...tournamentFixture(), hostingMode: 'shared', rounds: [], players: [{ id: 'p1', name: 'Moderadora' }] },
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
      canJoin: true,
    });

    await page.goto('/?invite=invite-token');
    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toBeVisible();

    const stored = await page.evaluate(() => ({
      tournament: localStorage.getItem('setpoint.tournament.v1'),
      build: localStorage.getItem('setpoint.build.v1'),
    }));
    expect(stored).toEqual({ tournament: finished, build: 'an-older-build' });
  });
});

test.describe('shared view: realtime', () => {
  test('a live viewer stops listening for changes once the tournament is finished', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = { ...tournamentFixture(), hostingMode: 'local' };
    supabase.rpc('get_local_live_tournament', { id: 'live-1', status: 'active', state });

    await page.goto('/?live=live-token');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
    const topic = 'realtime:local-live:live-1';
    await expect
      .poll(() =>
        supabase
          .realtime()
          .filter((m) => m.topic === topic)
          .map((m) => m.event),
      )
      .toEqual(['phx_join']);

    supabase.rpc('get_local_live_tournament', { id: 'live-1', status: 'completed', state });

    await expect
      .poll(
        () =>
          supabase
            .realtime()
            .filter((m) => m.topic === topic)
            .map((m) => m.event),
        { timeout: 15_000 },
      )
      .toEqual(['phx_join', 'phx_leave']);
    await expect(page.locator('.arena-badge')).not.toHaveClass(/live/);
  });

  test('an active admin viewer shows an update without a reload', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = { ...tournamentFixture(), hostingMode: 'local' };
    supabase.rpc('get_dashboard_tournament', { id: 't1', status: 'active', state });

    await page.goto('/?dashboardTournament=t1&source=local');
    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();

    supabase.rpc('get_dashboard_tournament', { id: 't1', status: 'active', state: withOneMoreScore(state) });

    const pill = page.getByRole('button', { name: '1 nova atualização' });
    await expect(pill).toBeVisible({ timeout: 15_000 });
    await pill.click();
    await expect(pill).toHaveCount(0);
  });
});

test.describe('shared view: guest navigation', () => {
  // The bottom bar is the phone layout.
  test.use({ viewport: { width: 390, height: 844 } });

  test('Partidas, Ranking and Meu caminho, with the ranking opening a player', async ({ page }) => {
    await seedStorage(page, { 'setpoint.profile.v1': JSON.stringify({ name: 'Ana', autoJoin: true }) });
    const supabase = await mockSupabase(page);
    supabase.rpc('get_shared_tournament', {
      id: 'shared-1',
      status: 'active',
      capacity: 8,
      state: projectionState(),
      inviteExpiresAt: '2099-01-01T00:00:00Z',
      expiresAt: null,
      canJoin: false,
    });

    await page.goto('/?invite=invite-token');

    const nav = page.getByRole('navigation', { name: 'Navegação do torneio' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Finais' })).toBeDisabled();

    await nav.getByRole('button', { name: 'Ranking' }).click();
    await page.locator('#guest-ranking button.ranking-player-button').first().click();
    const dialog = page.getByRole('dialog', { name: /./ });
    await expect(dialog.getByText('HISTÓRICO DO ATLETA')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await nav.getByRole('button', { name: /^Meu caminho/ }).click();
    await expect(page.getByText('SEU CAMINHO')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ana' })).toBeVisible();

    await nav.getByRole('button', { name: 'Partidas' }).click();
    await expect(page.getByText('SEU CAMINHO')).toHaveCount(0);
    await expect(page.locator('#guest-rounds')).toBeVisible();
  });
});

test.describe('host projection', () => {
  test('the host opens Projeção once round 1 is done', async ({ page }) => {
    await seedStorage(page, { 'setpoint.tournament.v1': JSON.stringify(projectionState()) });
    await mockSupabase(page);

    await page.goto('/');
    const entry = page.getByRole('button', { name: /^Projeção/ });
    await expect(entry).toBeVisible();
    // The unlock tip is in the bar (CSS shows it on phones).
    await expect(page.locator('.main-nav .nav-tip')).toHaveText(/Projeção liberada!/);

    await entry.click();

    await expect(page.getByText('CAMINHO DE')).toBeVisible();
    const athletes = page.getByRole('radiogroup', { name: 'Atleta' });
    await expect(athletes).toBeVisible();

    // Picking another athlete shows their path.
    const other = athletes.getByRole('radio').nth(3);
    const name = (await other.locator(':scope > span').innerText()).trim();
    await other.click();
    await expect(other).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#qualTitle')).toHaveText(name);
    await expect(page.locator('.main-nav .nav-tip')).toHaveCount(0);
  });
});
