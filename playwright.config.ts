import { defineConfig, devices } from '@playwright/test';

const port = 4200;

/**
 * Visual baselines (e2e/visual.spec.ts) compare pixels, which only match inside one environment.
 * They run in the `visual` CI job and through `npm run e2e:visual`, both inside the same Playwright image.
 * `npm run e2e` (and the plain e2e CI job) leave them out, because a different Chrome or font stack renders differently.
 */
const visual = !!process.env['E2E_VISUAL'];

/**
 * End-to-end tests run against the real app in the browser. All traffic to hosts other than
 * localhost is blocked by e2e/support/fixtures.ts, so tests never reach Supabase or PostHog.
 *
 * Locally, set E2E_BROWSER_CHANNEL=chrome to use the installed Google Chrome instead of
 * downloading a Playwright browser. CI installs Chromium with `npx playwright install`.
 */
export default defineConfig<{ routerEnabled: boolean }>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  // One environment, so no platform or project suffix in the file name.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  // Exact by default. Full-page shots allow 32 pixels: 3 to 16 can differ between runs at the edge of the fixed, blurred bars (raster noise).
  expect: { toHaveScreenshot: { threshold: 0, maxDiffPixels: 0 } },
  // CI never writes a missing baseline: a new or renamed shot must be committed.
  updateSnapshots: process.env['CI'] ? 'none' : 'missing',
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'visual.spec.ts',
      use: { ...devices['Desktop Chrome'], channel: process.env['E2E_BROWSER_CHANNEL'] || undefined },
    },
    {
      // The same journeys that depend on the address, with the Angular Router handling it (the routerEnabled flag).
      name: 'chromium-router',
      testMatch: [
        'url-contract.spec.ts',
        'live-viewer.spec.ts',
        'shared-invite.spec.ts',
        'shared-view.spec.ts',
        'tournament-flow.spec.ts',
        'tournament-pages.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env['E2E_BROWSER_CHANNEL'] || undefined,
        routerEnabled: true,
      },
    },
    ...(visual
      ? [
          {
            // Bundled Chromium on purpose (no channel): the baselines come from the Playwright image CI also uses.
            name: 'visual',
            // A flaky pixel diff must fail, not pass on a retry.
            retries: 0,
            testMatch: 'visual.spec.ts',
            use: { ...devices['Desktop Chrome'], timezoneId: 'UTC' },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npx ng serve --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
