import { defineConfig, devices } from '@playwright/test';

const port = 4200;

/**
 * Visual baselines (e2e/visual.spec.ts) compare pixels, which only match inside one environment.
 * They run in the `visual` CI job and through `npm run e2e:visual`, both inside the same Playwright image.
 * `npm run e2e` (and the plain e2e CI job) leave them out, because a different Chrome or font stack renders differently.
 */
const visual = !!process.env['E2E_VISUAL'];

const ci = !!process.env['CI'];

/**
 * The production smoke (e2e/production.spec.ts) runs against the production build served under the GitHub Pages
 * base path by scripts/serve-dist.cjs, through `npm run e2e:prod` (which builds first) and the `e2e-production` CI job.
 * With E2E_PROD set, only its two projects run and only that server starts; without it, the dev-server suite runs.
 */
const production = !!process.env['E2E_PROD'];
const productionURL = 'http://127.0.0.1:4300/setpoint-beach-tennis/';
const channel = process.env['E2E_BROWSER_CHANNEL'] || undefined;

/**
 * A test that fails and then passes on its retry is flaky. On pull requests it passes, and the `github` reporter
 * lists it in the run summary and annotates the failing attempt. The nightly run sets E2E_FAIL_ON_FLAKY, so a
 * flaky test fails it instead of hiding behind the retry.
 */
const failOnFlaky = !!process.env['E2E_FAIL_ON_FLAKY'];

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
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  failOnFlakyTests: failOnFlaky,
  // One worker per vCPU of the GitHub runner (4). CI also splits the suite into shards (--shard in ci.yml).
  workers: ci ? 4 : undefined,
  // One environment, so no platform or project suffix in the file name.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  // Exact by default. Full-page shots allow 32 pixels: 3 to 16 can differ between runs at the edge of the fixed, blurred bars (raster noise).
  expect: { toHaveScreenshot: { threshold: 0, maxDiffPixels: 0 } },
  // CI never writes a missing baseline: a new or renamed shot must be committed.
  updateSnapshots: ci ? 'none' : 'missing',
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    // Recording a trace slows every test, so CI records one only for the retry of a failed test (failed again or flaky).
    trace: ci ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
  },
  projects: production
    ? [
        {
          name: 'production',
          testMatch: 'production.spec.ts',
          use: { ...devices['Desktop Chrome'], channel, baseURL: productionURL },
        },
        {
          name: 'production-router',
          testMatch: 'production.spec.ts',
          use: { ...devices['Desktop Chrome'], channel, baseURL: productionURL, routerEnabled: true },
        },
      ]
    : [
        {
          name: 'chromium',
          testIgnore: ['visual.spec.ts', 'production.spec.ts'],
          use: { ...devices['Desktop Chrome'], channel },
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
          use: { ...devices['Desktop Chrome'], channel, routerEnabled: true },
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
  webServer: production
    ? {
        // Serves dist/ as it is: build it first (npm run e2e:prod does).
        command: 'node scripts/serve-dist.cjs',
        url: productionURL,
        reuseExistingServer: !ci,
        timeout: 30_000,
      }
    : {
        command: `npx ng serve --port ${port}`,
        url: `http://localhost:${port}`,
        reuseExistingServer: !ci,
        timeout: 180_000,
      },
});
