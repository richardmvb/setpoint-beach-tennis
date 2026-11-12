import { test as base, expect, type Page } from '@playwright/test';

/** Hosts that are always allowed. Everything else (Supabase, PostHog, Google Fonts) is blocked. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export interface Onboarding {
  /** Skip the marketing landing page (default true). */
  skipLanding: boolean;
  /** Turn the driver.js setup tour off (default true). */
  disableTour: boolean;
  /** Mark the welcome profile prompt as already shown (default true). */
  skipProfilePrompt: boolean;
}

interface Fixtures {
  onboarding: Onboarding;
  /** Seed for Math.random so the draw is the same on every run. Use null to keep real randomness. */
  randomSeed: number | null;
  /** External requests that were attempted and blocked during the test. */
  blockedRequests: string[];
}

/**
 * `page` is replaced by a version that never reaches external services and starts like a
 * returning user. Override `onboarding` in a spec with `test.use({ onboarding: { ... } })`.
 */
export const test = base.extend<Fixtures>({
  onboarding: [{ skipLanding: true, disableTour: true, skipProfilePrompt: true }, { option: true }],
  randomSeed: [20261112, { option: true }],
  blockedRequests: async ({}, use) => {
    await use([]);
  },
  page: async ({ page, onboarding, randomSeed, blockedRequests }, use) => {
    await page.route(
      (url) => !LOCAL_HOSTS.has(url.hostname),
      (route) => {
        blockedRequests.push(route.request().url());
        return route.abort();
      },
    );
    await page.addInitScript((flags: Onboarding) => {
      try {
        if (flags.skipLanding) localStorage.setItem('setpoint.landing.seen', 'true');
        if (flags.disableTour) localStorage.setItem('setpoint.tutorial.setup', 'off');
        if (flags.skipProfilePrompt) localStorage.setItem('setpoint.profile.prompted', 'true');
      } catch {
        /* storage unavailable: the app handles it the same way */
      }
    }, onboarding);
    if (randomSeed !== null) {
      // Deterministic draw: the schedule shuffle and tie-break draw use Math.random and crypto, so a fixed seed gives the same tournament,
      // the same ties and the same accessibility results on every run. The sequence restarts on each page load.
      await page.addInitScript((seed: number) => {
        let state = seed >>> 0;
        Math.random = (): number => {
          state = (state + 0x6d2b79f5) >>> 0;
          let t = state;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        // The tie-break draw uses crypto.getRandomValues, so seed it from the same sequence.
        crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
          if (array) {
            const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            for (let i = 0; i < view.length; i++) view[i] = Math.floor(Math.random() * 256);
          }
          return array;
        };
      }, randomSeed);
    }
    await use(page);
  },
});

export { expect };

export const PLAYER_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fabio', 'Gabi', 'Hugo'] as const;

/** Wizard: 8 players added in a batch, then generate the table. The app starts at the setup page. */
export async function createLocalTournament(page: Page, name = 'Torneio E2E'): Promise<void> {
  await page.goto('/');
  await page.locator('#setupName').fill(name);
  await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
  await page.getByRole('button', { name: /Adicionar em lote/ }).click();
  await page.locator('textarea[name=batchPlayers]').fill(PLAYER_NAMES.join('\n'));
  await page.getByRole('button', { name: /Gerar prévia/ }).click();
  await page.getByRole('button', { name: /Adicionar 8 participante/ }).click();
  await page.getByRole('button', { name: /Revisar torneio/ }).click();
  await page.getByRole('button', { name: /Gerar tabela/ }).click();
  await expect(page.getByRole('heading', { name: 'Partidas', exact: true })).toBeVisible();
}

/**
 * Score every group-stage match: the winner reaches the default 4 games, the loser gets 0 to 3.
 * Scores save automatically once they are valid, so no save button is involved.
 */
export async function completeRoundMatches(page: Page): Promise<void> {
  const rounds = page.locator('.round-tabs button');
  const total = await rounds.count();
  expect(total).toBeGreaterThan(0);
  for (let round = 0; round < total; round++) {
    await rounds.nth(round).click();
    const inputs = page.locator('input.inline-score');
    const count = await inputs.count();
    for (let i = 0; i < count; i += 2) {
      await inputs.nth(i).fill('4');
      await inputs.nth(i + 1).fill(String((i / 2 + round) % 4));
    }
    await expect(rounds.nth(round)).toContainText('✓');
  }
}

/** Finals are set scores: the winner reaches 6 games. Scores every editable final match 6 to 2. */
export async function completeFinalMatches(page: Page): Promise<void> {
  const inputs = page.locator('input[type=number]');
  await expect(inputs.first()).toBeVisible();
  const count = await inputs.count();
  for (let i = 0; i < count; i += 2) {
    if (await inputs.nth(i).isDisabled()) continue;
    await inputs.nth(i).fill('6');
    await inputs.nth(i + 1).fill('2');
  }
}

/**
 * Generate the finals from the ranking. Random draws can tie players, and the app then asks for a
 * tie-break draw before the finals can be created. Resolve that as needed.
 */
export async function generateFinals(page: Page): Promise<void> {
  const finals = page.getByRole('heading', { name: 'Finais', exact: true });
  const tieBreak = page.getByRole('dialog', { name: /Empate entre/ });
  await page.getByRole('button', { name: 'Gerar finais' }).click();
  for (let attempt = 0; attempt < 6; attempt++) {
    await expect(tieBreak.or(finals)).toBeVisible();
    if (await finals.isVisible()) return;
    // Two stages: draw the order, then confirm it. Another tie may follow (for example 6th and 7th).
    await tieBreak.getByRole('button', { name: 'Realizar sorteio' }).click();
    await tieBreak.getByRole('button', { name: 'Confirmar e gerar finais' }).click();
  }
  await expect(finals).toBeVisible();
}
