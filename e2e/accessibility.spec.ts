import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completeRoundMatches, createLocalTournament, expect, generateFinals, test } from './support/fixtures';

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
async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const notices = page.locator('.notice button');
  while ((await notices.count()) > 0) await notices.first().click();
}

async function scan(page: Page): Promise<Record<string, number>> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
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
});
