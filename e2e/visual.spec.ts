import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { completeFinalMatches, completeRoundMatches, expect, generateFinals, test } from './support/fixtures';
import { openLibrary, seedTwoTournaments } from './support/library';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * Visual baselines: screenshots of the key pages and overlays in e2e/__screenshots__, on desktop in light and dark, and at
 * phone width in light (the stylesheet has dozens of phone-only rules). They are expected output, not a suppression baseline.
 * A change that is meant to be visual regenerates them with `npm run e2e:visual:update` (the Playwright image CI uses)
 * and the PR names each image that changed. A style refactor must pass them unchanged.
 */

/** Fixed so every elapsed-time label reads the same on every run. */
const NOW = new Date('2026-11-12T13:30:00.000Z');

const tournamentJson = readFileSync(
  join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'),
  'utf8',
);

const groups20Json = readFileSync(
  join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v2.json'),
  'utf8',
);

type Theme = 'light' | 'dark';
interface Config {
  theme: Theme;
  phone: boolean;
}
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const CONFIGS: Config[] = [
  { theme: 'light', phone: false },
  { theme: 'dark', phone: false },
  { theme: 'light', phone: true },
];

/** Wait for the web fonts and stop every transition, so the shot is of a settled page. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // No leftover focus ring, spinner or hover from the last interaction.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
}

/**
 * Grow the viewport to the page height before a full-page shot. Otherwise the sticky header and the floating tab bar
 * are pasted over the middle of the content. Two passes, because a taller viewport can change viewport-relative sizes.
 */
async function fitViewportToPage(page: Page, base: { width: number; height: number }): Promise<void> {
  // Start from the default height: scrollHeight never reports less than the viewport, so a page shorter than the last shot would keep its height.
  await page.setViewportSize(base);
  for (let pass = 0; pass < 2; pass++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: base.width, height });
    await page.evaluate(() => document.fonts.ready);
  }
}

for (const config of CONFIGS) {
  const { theme, phone } = config;
  const base = phone ? PHONE : DESKTOP;
  const tag = (name: string): string => `${phone ? 'phone-' : ''}${name}-${theme}.png`;

  /** A whole page, from the top, with the sticky bars where a visitor sees them. */
  const page_ = async (page: Page, name: string): Promise<void> => {
    await settle(page);
    await fitViewportToPage(page, base);
    await expect(page).toHaveScreenshot(tag(name), {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 32,
    });
  };
  /** What is on screen now: for panels, popovers and dialogs that float over the page. */
  const view = async (page: Page, name: string): Promise<void> => {
    // The size a visitor has: dialogs are sized from the viewport height, and a previous full-page shot may have made it page-tall.
    await page.setViewportSize(base);
    // Shrinking the viewport can leave the page behind the dialog at a scroll position that varies from run to run.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          window.scrollTo(0, 0);
          // Autofocus can leave a scrollable dialog a pixel down, depending on timing.
          for (const element of document.querySelectorAll<HTMLElement>('.cdk-overlay-container *'))
            element.scrollTop = 0;
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
    );
    await settle(page);
    await expect(page).toHaveScreenshot(tag(name), { animations: 'disabled', caret: 'hide' });
  };
  const startFromFixture = async (page: Page): Promise<void> => {
    // Start from the stored fixture, not a fresh draw, so the players and fixtures never depend on random calls at load.
    await page.addInitScript((state: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
    }, tournamentJson);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Partidas/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Partidas', exact: true })).toBeVisible();
  };

  test.describe(`visual baselines (${phone ? 'phone ' : ''}${theme})`, () => {
    test.use({ viewport: base });

    test.beforeEach(async ({ page }, testInfo) => {
      // The projection computes in time slices that read the clock, so it never finishes under a frozen Date. It shows no elapsed time.
      if (testInfo.title !== 'projection') await page.clock.setFixedTime(NOW);
      await page.addInitScript((mode: Theme) => localStorage.setItem('setpoint.theme.v1', mode), theme);
    });

    test.describe('landing', () => {
      test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });
      test('landing', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
        await page_(page, 'landing');
      });
    });

    test('setup', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
      await page_(page, 'setup');
    });

    test.describe('setup tour', () => {
      test.use({ onboarding: { skipLanding: true, disableTour: false, skipProfilePrompt: true } });
      test('tour popover', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.driver-popover')).toBeVisible();
        await view(page, 'tour');
      });
    });

    test('rounds, ranking, finals, dialogs and podium', async ({ page }) => {
      test.slow();
      await startFromFixture(page);
      await completeRoundMatches(page);
      await page_(page, 'rounds');

      await page.getByRole('button', { name: 'Ranking e finais →' }).first().click();
      await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
      await page_(page, 'ranking');

      await generateFinals(page);
      await page_(page, 'finals');

      await completeFinalMatches(page);
      await expect(page.getByRole('button', { name: 'Finalizar torneio' })).toBeVisible();
      await page.getByRole('radiogroup', { name: 'Atleta para gerar a imagem' }).getByRole('radio').first().click();
      await page.getByRole('button', { name: /^Gerar imagem de / }).click();
      const share = page.getByRole('dialog', { name: 'Personalize e confira' });
      // The preview is drawn on a canvas and handed over as an image: wait until it is on screen and decoded.
      const preview = share.getByRole('img', { name: 'Prévia do card de resultados' });
      await expect(preview).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(() =>
          preview.evaluate((el) => (el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : true)),
        )
        .toBe(true);
      await view(page, 'share-results');
      await page.keyboard.press('Escape');
      await expect(share).toHaveCount(0);

      await page.getByRole('button', { name: 'Finalizar torneio' }).click();
      const confirm = page.getByRole('alertdialog', { name: /Finalizar o torneio/ });
      await confirm.getByRole('button', { name: 'Finalizar torneio' }).click();
      await expect(confirm).toHaveCount(0);
      // Finishing opens the final report in Ajustes; the podium is on Ranking.
      await expect(page.getByRole('heading', { name: 'Relatório final' })).toBeVisible();
      await page_(page, 'final-report');
      await page
        .getByRole('button', { name: /Ranking/ })
        .first()
        .click();
      await expect(page.locator('.podium-duration')).toBeVisible();
      await page_(page, 'podium');
    });

    test('projection', async ({ page }) => {
      // The host's projection needs a shared tournament with qualification stats and round 1 finished (as in shared-view.spec).
      const state = JSON.parse(tournamentJson) as Record<string, unknown>;
      const rounds = state['rounds'] as { matches: Record<string, unknown>[] }[];
      Object.assign(rounds[0].matches[1], { scoreA: 4, scoreB: 1 });
      const shared = {
        ...state,
        rounds,
        hostingMode: 'shared',
        qualificationStats: true,
        sharedTournamentId: 'shared-1',
      };
      await page.addInitScript((value: string) => {
        if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
      }, JSON.stringify(shared));
      await mockSupabase(page);
      await page.goto('/');
      await page.getByRole('button', { name: /^Projeção/ }).click();
      await expect(page.getByText('CAMINHO DE')).toBeVisible();
      // The "Projeção liberada!" tip in the bar leaves on a timer; wait for it so the shot never catches it mid-way.
      await expect(page.locator('.main-nav .nav-tip')).toHaveCount(0, { timeout: 15_000 });
      await page_(page, 'projection');
    });

    test('profile panel', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Perfil' }).click();
      await expect(page.locator('#profileName')).toBeVisible();
      await view(page, 'profile');
    });

    test('library and delete confirmation', async ({ page }) => {
      await seedTwoTournaments(page);
      await page.goto('/');
      const library = await openLibrary(page);
      await view(page, 'library');
      await library.getByRole('button', { name: 'Excluir Torneio antigo' }).click();
      await expect(page.getByRole('alertdialog', { name: 'Excluir este torneio salvo?' })).toBeVisible();
      await view(page, 'confirm-delete');
    });

    test('live viewer', async ({ page }) => {
      const supabase = await mockSupabase(page);
      supabase.rpc('get_local_live_tournament', {
        id: 'live-1',
        status: 'active',
        state: { ...tournamentFixture(), hostingMode: 'local' },
      });
      await page.goto('/?live=live-read-token-123');
      await expect(page.getByRole('heading', { level: 1, name: 'Fixture v1' })).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Progresso do torneio' })).toBeVisible();
      await page_(page, 'live-viewer');
    });

    test('groups 20 setup', async ({ page }) => {
      await page.goto('/');
      await page
        .locator('#tournamentMode')
        .getByRole('radio', { name: /^Grupos/ })
        .click();
      // The size slider lists 8, 12, 20 and 24: index 2 is 20.
      await page.locator('#setupSize').fill('2');
      await expect(page.getByRole('radio', { name: /4 grupos de 5/ })).toBeVisible();
      await page_(page, 'setup-groups20');
    });

    test('groups 20 ranking and bracket', async ({ page }) => {
      await page.addInitScript((state: string) => {
        if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
      }, groups20Json);
      await page.goto('/');
      await page
        .getByRole('button', { name: /Ranking/ })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: 'Classificados' })).toBeVisible();
      await page_(page, 'ranking-groups20');
    });

    test('groups 20 bracket view', async ({ page }) => {
      await page.addInitScript((state: string) => {
        if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
      }, groups20Json);
      await page.goto('/');
      await page
        .getByRole('button', { name: /Ranking/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Chave', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Chave da fase final' })).toBeVisible();
      await page_(page, 'ranking-groups20-bracket');
    });

    test('groups 20 live viewer', async ({ page }) => {
      const supabase = await mockSupabase(page);
      supabase.rpc('get_local_live_tournament', {
        id: 'live-20',
        status: 'active',
        state: JSON.parse(groups20Json),
      });
      await page.goto('/?live=live-read-token-123');
      await expect(page.getByRole('heading', { level: 1, name: 'Fixture v2 Grupos 20' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Classificados' })).toBeVisible();
      await page_(page, 'live-viewer-groups20');
    });

    test('guest invite', async ({ page }) => {
      const supabase = await mockSupabase(page);
      supabase.rpc('get_shared_tournament', {
        id: 'shared-1',
        status: 'registration',
        capacity: 8,
        state: {
          ...tournamentFixture(),
          hostingMode: 'shared',
          sharedStatus: 'registration',
          rounds: [],
          startedAt: undefined,
          players: [{ id: 'p1', name: 'Moderadora' }],
        },
        inviteExpiresAt: '2099-01-01T00:00:00Z',
        expiresAt: null,
        canJoin: true,
      });
      await page.goto('/?invite=invite-token-abc');
      await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toBeVisible();
      await page_(page, 'guest-invite');
    });

    test('dashboard login', async ({ page }) => {
      await mockSupabase(page);
      await page.goto('/dashboard');
      await expect(page.getByText('ACESSO RESTRITO')).toBeVisible();
      await page_(page, 'dashboard-login');
    });
  });
}
