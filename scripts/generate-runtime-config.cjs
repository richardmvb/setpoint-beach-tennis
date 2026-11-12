#!/usr/bin/env node
/**
 * Writes public/runtime-config.js from environment variables before the Angular build.
 *
 * - CI runs it without --require-values, so pull requests build even without secrets.
 * - Deploy runs it with --require-values, so a release never ships without Supabase settings.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const requireValues = process.argv.includes('--require-values');
const env = process.env;

function gitCommitCount() {
  try {
    return Number(
      execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim(),
    );
  } catch {
    return 0;
  }
}

const config = {
  supabaseUrl: env.SUPABASE_URL || '',
  publishableKey: env.SUPABASE_PUBLISHABLE_KEY || '',
  buildId: (env.BUILD_ID || '').slice(0, 7),
  buildVersion: Number(env.BUILD_VERSION ?? gitCommitCount()),
  production: true,
  lockScreenEnabled: env.NG_APP_LOCK_SCREEN_ENABLED === 'true',
  ...(env.NG_APP_POSTHOG_PROJECT_TOKEN ? { posthogKey: env.NG_APP_POSTHOG_PROJECT_TOKEN } : {}),
  ...(env.NG_APP_POSTHOG_HOST ? { posthogHost: env.NG_APP_POSTHOG_HOST } : {}),
};

const problems = [];
if (!Number.isInteger(config.buildVersion) || config.buildVersion < 0) {
  problems.push('buildVersion must be a non-negative integer');
}
if (requireValues) {
  if (!config.supabaseUrl.startsWith('https://')) problems.push('SUPABASE_URL must be an https:// URL');
  if (!config.publishableKey) problems.push('SUPABASE_PUBLISHABLE_KEY is required');
}
if (problems.length) {
  console.error(`Invalid runtime config:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const target = path.join(__dirname, '..', 'public', 'runtime-config.js');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `window.__SETPOINT_CONFIG__ = ${JSON.stringify(config)};\n`);
console.log(
  `Runtime config written to public/runtime-config.js (build ${config.buildId || 'local'}, version ${config.buildVersion})`,
);
