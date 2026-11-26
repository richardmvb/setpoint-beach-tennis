import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test.describe('live viewer: Grupos 20', () => {
  test('shows the qualifiers, who rests in each round and the bracket with byes', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v2.json'), 'utf8'),
    ) as Record<string, unknown>;
    supabase.rpc('get_local_live_tournament', { id: 'live-20', status: 'active', state });

    await page.goto(`/?live=${TOKEN}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Fixture v2 Grupos 20' })).toBeVisible();
    // The finals exist and the group stage is over: the finals come first and the groups fold into one row.
    await expect(page.getByText('Fase de grupos encerrada')).toBeVisible();
    // One line per round (the played rounds are folded).
    await expect(page.getByText(/^Descansam: /)).toHaveCount(5);
    const bracket = page.getByRole('region', { name: 'Chave da fase final' });
    await expect(bracket).toBeVisible();
    await expect(bracket.getByRole('article', { name: 'Quartas 1' })).toBeVisible();
    await expect(bracket.getByText('BYE', { exact: true })).toHaveCount(2);
    await expect(bracket.getByText('Vencedor QF2')).toBeVisible();
    await expect(page.locator('input.inline-score')).toHaveCount(0);
  });
});

test.describe('live viewer: the viewer line', () => {
  test('a guest whose name is in the tournament sees their own line, and the choice is theirs to change', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem('setpoint.profile.v1', JSON.stringify({ name: 'Diego', autoJoin: false })),
    );
    const supabase = await mockSupabase(page);
    const state = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v2.json'), 'utf8'),
    ) as Record<string, unknown>;
    delete state['finals'];
    supabase.rpc('get_local_live_tournament', { id: 'live-20', status: 'active', state });
    await page.goto(`/?live=${TOKEN}`);

    await expect(page.getByRole('heading', { name: 'Quem vai para a final' })).toBeVisible();
    await expect(page.getByText(/Você: Diego\./)).toBeVisible();
    await expect(page.getByText(/º no Grupo C\. Você (passa|ficou fora)/)).toBeVisible();
    // His group opens first.
    await expect(page.getByRole('table', { name: 'Tabela do Grupo C' })).toBeVisible();

    await page.getByRole('button', { name: 'Compacto' }).click();
    await expect(page.getByRole('heading', { name: 'Corrida para a final' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Compacto' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Você: Diego\./)).toHaveCount(0);
  });
});

test.describe('live viewer: Grupos 20 on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('both views fit the screen without a sideways scroll', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v2.json'), 'utf8'),
    ) as Record<string, unknown>;
    supabase.rpc('get_local_live_tournament', { id: 'live-20', status: 'active', state });
    await page.goto(`/?live=${TOKEN}`);
    await page.getByText('Fase de grupos encerrada').click();
    const noSidewaysScroll = async (): Promise<void> => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      );
    };

    // A guest starts on Resumo: the groups open in place and the two lists unfold.
    await expect(page.getByRole('heading', { name: 'Quem vai para a final' })).toBeVisible();
    await page.getByText('Ordem dos 12 classificados').click();
    await page.getByText('Ranking individual (20 atletas)').click();
    await expect(page.getByRole('table', { name: 'Corrida para a final' })).toBeVisible();
    await noSidewaysScroll();

    await page.getByRole('button', { name: 'Compacto' }).click();
    const race = page.getByRole('article', { name: 'Corrida para a final' });
    await expect(race).toBeVisible();
    await page.getByRole('button', { name: 'Ver a tabela do Grupo A' }).click();
    await expect(page.getByRole('table', { name: 'Tabela do Grupo A' })).toBeVisible();
    for (const box of [race, page.getByRole('region', { name: 'Grupos' })]) {
      const overflow = await box.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await noSidewaysScroll();
  });
});

test.describe('live viewer: the bracket on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the columns slide under the tabs, and the page does not scroll sideways', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const state = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v2.json'), 'utf8'),
    ) as Record<string, unknown>;
    supabase.rpc('get_local_live_tournament', { id: 'live-20', status: 'active', state });
    await page.goto(`/?live=${TOKEN}`);

    const track = page.getByRole('region', { name: 'Chave da fase final' });
    await track.scrollIntoViewIfNeeded();
    const quartas = page.getByRole('button', { name: 'Quartas', exact: true });
    const final = page.getByRole('button', { name: 'Final', exact: true });
    await expect(quartas).toHaveAttribute('aria-pressed', 'true');

    await final.click();
    await expect(final).toHaveAttribute('aria-pressed', 'true');
    await expect(track.getByRole('heading', { level: 3, name: 'Final', exact: true })).toBeInViewport();

    await track.evaluate((element) => element.scrollTo({ left: 0, behavior: 'instant' }));
    await expect(quartas).toHaveAttribute('aria-pressed', 'true');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

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
