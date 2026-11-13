/**
 * Lighthouse CI on the production build (`npm run perf:lighthouse`, after a build with the
 * /setpoint-beach-tennis/ base href). scripts/serve-dist.cjs serves dist/ and mocks Supabase on the
 * same origin, and the app's external hosts are blocked, so no run reaches Supabase, PostHog or Google Fonts.
 *
 * Thresholds are the medians of 3 runs on the default mobile preset (simulated throttling), measured
 * on 2026-11-13 (locally and on the CI runner, whichever is higher), plus 25% for LCP and TBT and 10% for
 * bytes (CLS: +0.02, at least 0.05). They are a
 * ratchet: lower them when a change improves a number, never raise them.
 * TBT stands in for INP, which a lab run cannot measure.
 */
const BASE = 'http://127.0.0.1:4300/setpoint-beach-tennis/';

const median = (maxNumericValue) => ['error', { maxNumericValue, aggregationMethod: 'median' }];

/** LCP and TBT in ms, CLS unitless, bytes as transferred (gzip). */
const limits = ({ lcp, cls, tbt, bytes }) => ({
  'largest-contentful-paint': median(lcp),
  'cumulative-layout-shift': median(cls),
  'total-blocking-time': median(tbt),
  'total-byte-weight': median(bytes),
});

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run perf:serve',
      startServerReadyPattern: 'Serving dist on',
      url: [BASE, `${BASE}?live=lhci-token`, `${BASE}dashboard`],
      numberOfRuns: 3,
      settings: {
        onlyCategories: ['performance'],
        blockedUrlPatterns: ['*.supabase.co*', '*posthog.com*', '*fonts.googleapis.com*', '*fonts.gstatic.com*'],
      },
    },
    assert: {
      // Each pattern must match one URL above: an entry that matches nothing passes silently, so update both together.
      assertMatrix: [
        // First visit: the landing page (clean storage).
        {
          matchingUrlPattern: '/setpoint-beach-tennis/$',
          assertions: limits({ lcp: 1200, cls: 0.06, tbt: 220, bytes: 550000 }),
        },
        // Live viewer of a running tournament (mocked get_local_live_tournament).
        { matchingUrlPattern: '\\?live=', assertions: limits({ lcp: 5300, cls: 0.11, tbt: 150, bytes: 570000 }) },
        // Admin dashboard, signed out: the e-mail sign-in form.
        { matchingUrlPattern: '/dashboard$', assertions: limits({ lcp: 1200, cls: 0.05, tbt: 50, bytes: 570000 }) },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
