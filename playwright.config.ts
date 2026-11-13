import { defineConfig, devices } from '@playwright/test';

const port = 4200;

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
      use: { ...devices['Desktop Chrome'], channel: process.env['E2E_BROWSER_CHANNEL'] || undefined },
    },
    {
      // The same journeys that depend on the address, with the Angular Router handling it (the routerEnabled flag).
      name: 'chromium-router',
      testMatch: ['url-contract.spec.ts', 'live-viewer.spec.ts', 'shared-invite.spec.ts', 'tournament-flow.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env['E2E_BROWSER_CHANNEL'] || undefined,
        routerEnabled: true,
      },
    },
  ],
  webServer: {
    command: `npx ng serve --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
