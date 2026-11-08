const { spawnSync } = require('node:child_process');
const { config } = require('dotenv');

config({ quiet: true });

if (!process.env.POSTHOG_CLI_API_KEY || !process.env.POSTHOG_CLI_PROJECT_ID) {
  console.warn(
    'Skipping PostHog source map upload: POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID are required.',
  );
  process.exit(0);
}

const cliPath = require.resolve('@posthog/cli/run-posthog-cli.js');
const result = spawnSync(
  process.execPath,
  [
    cliPath,
    '--dotenv-file',
    '.env',
    'sourcemap',
    'process',
    '--directory',
    'dist/setpoint/browser',
    '--release-name',
    'setpoint-angular',
    '--delete-after',
  ],
  { env: process.env, stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
