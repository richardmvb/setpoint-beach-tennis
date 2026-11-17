import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeFinalMatches,
  completeRoundMatches,
  createLocalTournament,
  expect,
  generateFinals,
  test,
} from './support/fixtures';
import { openLibrary, seedTwoTournaments } from './support/library';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * Accessibility ratchet. e2e/a11y-baseline.json lists the axe violations that exist today, as
 * `{ page: { ruleId: affectedNodes } }`. A page fails when a rule appears that is not in the baseline,
 * or affects more nodes than recorded, so accessibility can only improve. Fix the violation, then lower
 * the baseline with `A11Y_RECORD=1 npm run e2e -- e2e/accessibility.spec.ts`, which never raises a count.
 */
const BASELINE_FILE = join(__dirname, 'a11y-baseline.json');
type Baseline = Record<string, Record<string, number>>;

function readBaseline(): Baseline {
  return existsSync(BASELINE_FILE) ? (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline) : {};
}

/** Make the page static before measuring: no running transitions and no transient notices. */
async function settle(page: Page, closeNotices: boolean): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  if (!closeNotices) return;
  const notices = page.locator('.notice button');
  while ((await notices.count()) > 0) await notices.first().click();
}

/**
 * `closeNotices` false while a modal dialog is open (the notices behind it cannot be reached), and `only` limits the
 * scan to the dialog, since the page behind it is not what the test is about.
 */
async function scan(page: Page, closeNotices = true, only?: string): Promise<Record<string, number>> {
  await settle(page, closeNotices);
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (only ? axe.include(only) : axe).analyze();
  return Object.fromEntries(results.violations.map((violation) => [violation.id, violation.nodes.length]));
}

/** Compare against the baseline (or, in record mode, lower the baseline). Returns the regressions. */
function check(name: string, found: Record<string, number>, baseline: Baseline): string[] {
  if (process.env['A11Y_RECORD']) {
    const current = readBaseline();
    const previous = current[name];
    current[name] = previous
      ? Object.fromEntries(
          Object.entries(found)
            .filter(([rule]) => rule in previous)
            .map(([rule, count]) => [rule, Math.min(count, previous[rule])]),
        )
      : found;
    const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n');
    return [];
  }
  const allowed = baseline[name] ?? {};
  return Object.entries(found)
    .filter(([rule, count]) => count > (allowed[rule] ?? 0))
    .map(([rule, count]) => `${name}: ${rule} affects ${count} nodes (baseline ${allowed[rule] ?? 0})`);
}

async function createLocalPlayers(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Adicionar em lote/ }).click();
  await page.locator('textarea[name=batchPlayers]').fill('Ana\nBia\nCaio\nDuda\nEdu\nFabi\nGui\nHana');
  await page.getByRole('button', { name: 'Gerar prévia' }).click();
  await page.getByRole('button', { name: /Adicionar 8 participante/ }).click();
}

test.describe('accessibility (axe, no new violations)', () => {
  test.describe.configure({ mode: 'serial' });

  test('setup wizard: configuration, players and review', async ({ page }) => {
    const baseline = readBaseline();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    const problems = check('setup-configuration', await scan(page), baseline);

    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
    problems.push(...check('setup-players', await scan(page), baseline));

    await page.getByRole('button', { name: /Adicionar em lote/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar participantes em lote' });
    await dialog.getByRole('textbox', { name: 'Lista de participantes' }).fill('Ana\nBia');
    await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
    problems.push(...check('batch-dialog', await scan(page), baseline));
    await page.keyboard.press('Escape');

    await createLocalPlayers(page);
    await page.getByRole('button', { name: /Revisar torneio/ }).click();
    await expect(page.getByRole('heading', { name: 'Revisar e iniciar' })).toBeVisible();
    problems.push(...check('setup-review', await scan(page), baseline));
    expect(problems).toEqual([]);
  });

  test.describe('landing page', () => {
    test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });
    test('landing', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
      expect(check('landing', await scan(page), readBaseline())).toEqual([]);
    });
  });

  test('shared views: invite and live link', async ({ page }) => {
    const baseline = readBaseline();
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
    supabase.rpc('get_local_live_tournament', {
      id: 'live-1',
      status: 'active',
      state: { ...tournamentFixture(), hostingMode: 'local' },
    });

    await page.goto('/?invite=invite-token');
    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toBeVisible();
    const problems = check('shared-invite', await scan(page), baseline);

    await page.goto('/?live=live-token');
    await expect(page.getByText('EM QUADRA AGORA')).toBeVisible();
    problems.push(...check('shared-live', await scan(page), baseline));
    expect(problems).toEqual([]);
  });

  test('tournament: rounds, ranking, finals and profile', async ({ page }) => {
    test.slow();
    const baseline = readBaseline();
    await createLocalTournament(page);
    const problems = check('rounds', await scan(page), baseline);

    await completeRoundMatches(page);
    await page.getByRole('button', { name: 'Ranking e finais →' }).first().click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    problems.push(...check('ranking', await scan(page), baseline));

    await generateFinals(page);
    problems.push(...check('finals', await scan(page), baseline));

    await page.getByRole('button', { name: 'Perfil' }).click();
    await expect(page.locator('#profileName')).toBeVisible();
    problems.push(...check('profile-panel', await scan(page), baseline));
    expect(problems).toEqual([]);
  });

  test('tournament: overview, players and settings', async ({ page }) => {
    const stored = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'), 'utf8'),
    ) as Record<string, unknown>;
    await page.addInitScript((value: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
    }, JSON.stringify(stored));
    const baseline = readBaseline();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    const problems = check('overview', await scan(page), baseline);

    await page
      .getByRole('button', { name: /Jogadores/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Jogadores inscritos' })).toBeVisible();
    problems.push(...check('players', await scan(page), baseline));

    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Regras do torneio' })).toBeVisible();
    problems.push(...check('settings', await scan(page), baseline));
    expect(problems).toEqual([]);
  });

  test('tournament: the tie-draw dialog, before and after the draw', async ({ page }) => {
    // Every match ends 4 to 4 on the stored fixture, so nothing separates the eight players.
    const stored = JSON.parse(
      readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'), 'utf8'),
    ) as { rounds: { matches: Record<string, unknown>[] }[] };
    for (const round of stored.rounds)
      for (const match of round.matches) Object.assign(match, { scoreA: 4, scoreB: 4 });
    await page.addInitScript((value: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
    }, JSON.stringify(stored));
    const baseline = readBaseline();
    await page.goto('/');
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Gerar finais' }).click();
    const dialog = page.getByRole('dialog', { name: /Empate entre/ });
    await expect(dialog).toBeVisible();
    const problems = check('tie-draw-dialog', await scan(page, false, '[role=dialog]'), baseline);
    await dialog.getByRole('button', { name: 'Realizar sorteio' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(8);
    problems.push(...check('tie-draw-dialog-drawn', await scan(page, false, '[role=dialog]'), baseline));
    expect(problems).toEqual([]);
  });

  test('the lock screen and the dashboard sign-in', async ({ page }) => {
    const baseline = readBaseline();
    await page.addInitScript(() => {
      (window as unknown as { __SETPOINT_CONFIG__: object }).__SETPOINT_CONFIG__ = {
        production: false,
        lockScreenEnabled: true,
      };
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Desbloquear torneio' })).toBeVisible();
    const problems = check('lock-screen', await scan(page), baseline);
    expect(problems).toEqual([]);
  });

  test('the dashboard sign-in', async ({ page }) => {
    await mockSupabase(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    expect(check('dashboard-login', await scan(page), readBaseline())).toEqual([]);
  });

  test("dialogs: saved tournaments, confirmation and a player's matches", async ({ page }) => {
    const baseline = readBaseline();
    await seedTwoTournaments(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    const library = await openLibrary(page);
    const problems = check('library-dialog', await scan(page, false, '[role=dialog]'), baseline);
    await library
      .getByRole('button', { name: /Fechar/ })
      .first()
      .click();

    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Iniciar novo torneio' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    problems.push(...check('confirm-dialog', await scan(page, false, '[role=alertdialog]'), baseline));
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    await page.locator('button.ranking-player-button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    problems.push(...check('player-matches-dialog', await scan(page, false, '[role=dialog]'), baseline));
    expect(problems).toEqual([]);
  });

  test('the share-results dialog', async ({ page }) => {
    test.slow();
    await createLocalTournament(page);
    await completeRoundMatches(page);
    await page.getByRole('button', { name: 'Ranking e finais →' }).first().click();
    await generateFinals(page);
    await completeFinalMatches(page);
    await page.getByRole('radiogroup', { name: 'Atleta para gerar a imagem' }).getByRole('radio').first().click();
    await page.getByRole('button', { name: /^Gerar imagem de / }).click();
    const dialog = page.getByRole('dialog', { name: 'Personalize e confira' });
    await expect(dialog.getByRole('img', { name: 'Prévia do card de resultados' })).toBeVisible();
    expect(check('share-results-dialog', await scan(page, false, '[role=dialog]'), readBaseline())).toEqual([]);
  });

  test.describe('dark theme', () => {
    test('overview, players, rounds, ranking and settings', async ({ page }) => {
      test.slow();
      const stored = JSON.parse(
        readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'), 'utf8'),
      ) as Record<string, unknown>;
      await page.addInitScript((value: string) => {
        localStorage.setItem('setpoint.theme.v1', 'dark');
        if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
      }, JSON.stringify(stored));
      const baseline = readBaseline();
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const problems = check('dark-overview', await scan(page), baseline);
      for (const [name, button, heading] of [
        ['dark-players', /Jogadores/, 'Jogadores'],
        ['dark-rounds', /Partidas/, 'Partidas'],
        ['dark-ranking', /Ranking/, 'Ranking'],
        ['dark-settings', /Ajustes/, 'Ajustes'],
      ] as const) {
        await page.getByRole('button', { name: button }).first().click();
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        problems.push(...check(name, await scan(page), baseline));
      }
      expect(problems).toEqual([]);
    });

    test.describe('landing and setup', () => {
      test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });
      test('dark landing', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('setpoint.theme.v1', 'dark'));
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
        expect(check('dark-landing', await scan(page), readBaseline())).toEqual([]);
      });
    });

    test('dark setup', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('setpoint.theme.v1', 'dark'));
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
      expect(check('dark-setup', await scan(page), readBaseline())).toEqual([]);
    });
  });
});
