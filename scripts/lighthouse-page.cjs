#!/usr/bin/env node
/**
 * Lighthouse for one page of the production build, the way CI checks it (one job per page, see ci.yml).
 *
 *   npm run perf:page -- --page <path> [--base <dir>] [--runs <n>]
 *
 * Build first, in this checkout and in --base: npm run build -- --base-href /setpoint-beach-tennis/
 *
 * --page  the address under /setpoint-beach-tennis/ ('' for the landing page, 'dashboard', '?live=lhci-token').
 * --base  a checkout of the base branch, already built with the same base href. When given, the base build is
 *         measured on this same machine, its runs alternating with this checkout's runs.
 * --runs  measured runs per build (default 3). One more run per build comes first and is discarded.
 *
 * Why it works this way (CI reports of 2026-11-18 to 2026-11-25):
 * - The first run of a page is a cold outlier: TBT 5 to 40 times the later runs, LCP sometimes 4 times. It is a
 *   warm-up run and is deleted before anything is asserted.
 * - After the warm-up, bytes, CLS and LCP barely move between runs or runners, so lighthouserc.cjs asserts them as
 *   absolute limits (errors).
 * - TBT follows the runner's CPU: the live page measured 155 to 215 ms on slower runners (benchmarkIndex about 2400)
 *   and 55 to 80 ms on faster ones (about 3000 to 3500). No absolute limit fits both, so lighthouserc.cjs only warns
 *   on it, and this script fails when the pull request's median TBT exceeds the base build's median on the same
 *   runner by more than TBT_RATIO and TBT_FLOOR_MS together. Within one runner, warm runs differ by about 15%.
 *
 * Reports for the artifact go to .lighthouseci/reports (lhci upload, filesystem target). The comparison table goes
 * to stdout and, in GitHub Actions, to the job summary.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4300/setpoint-beach-tennis/';
/** A pull request fails when its median TBT is above both the base median times this and the base median plus the floor. */
const TBT_RATIO = 1.3;
const TBT_FLOOR_MS = 50;

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'lighthouserc.cjs');
const LHCI = require.resolve('@lhci/cli/src/cli.js');

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = process.argv[at + 1];
  if (value === undefined) throw new Error(`--${name} needs a value`);
  return value;
}

const page = option('page', undefined);
if (page === undefined) {
  console.error('Usage: node scripts/lighthouse-page.cjs --page <path> [--base <dir>] [--runs <n>]');
  process.exit(2);
}
const baseDir = option('base', undefined);
const runs = Number(option('runs', '3'));
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');

const url = `${ORIGIN}${page}`;
const builds = [{ name: 'pull request', dir: ROOT }];
if (baseDir) builds.push({ name: 'base', dir: path.resolve(baseDir) });

function lhci(dir, args) {
  const result = spawnSync(process.execPath, [LHCI, ...args, `--config=${CONFIG}`], { cwd: dir, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function reports(dir) {
  const folder = path.join(dir, '.lighthouseci');
  return fs
    .readdirSync(folder)
    .filter((file) => /^lhr-.*\.json$/.test(file))
    .map((file) => ({
      file: path.join(folder, file),
      lhr: JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')),
    }))
    .sort((a, b) => Date.parse(a.lhr.fetchTime) - Date.parse(b.lhr.fetchTime));
}

// Collect: a warm-up round, then the measured rounds. In each round every build runs once, and the order alternates,
// so neither build always runs first.
for (const build of builds) fs.rmSync(path.join(build.dir, '.lighthouseci'), { recursive: true, force: true });
for (let round = 0; round <= runs; round++) {
  const order = round % 2 === 0 ? builds : [...builds].reverse();
  for (const build of order) {
    console.log(`\n${round === 0 ? 'Warm-up' : `Run ${round} of ${runs}`}: ${build.name}, ${url}`);
    const status = lhci(build.dir, ['collect', `--url=${url}`, '--numberOfRuns=1', '--additive']);
    if (status !== 0) process.exit(status);
  }
}
for (const build of builds) {
  const [warmUp] = reports(build.dir);
  fs.rmSync(warmUp.file);
  fs.rmSync(warmUp.file.replace(/\.json$/, '.html'), { force: true });
}

// Absolute limits (lighthouserc.cjs), on this checkout's runs, then the reports for the artifact.
const assertStatus = lhci(ROOT, ['assert']);
lhci(ROOT, ['upload']);

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const METRICS = [
  { id: 'total-blocking-time', label: 'TBT (ms)', format: (v) => Math.round(v) },
  { id: 'largest-contentful-paint', label: 'LCP (ms)', format: (v) => Math.round(v) },
  { id: 'cumulative-layout-shift', label: 'CLS', format: (v) => v.toFixed(3) },
  { id: 'total-byte-weight', label: 'Bytes (gzip)', format: (v) => Math.round(v) },
];
const measured = builds.map((build) => {
  const lhrs = reports(build.dir).map((entry) => entry.lhr);
  return {
    ...build,
    runs: lhrs.length,
    benchmark: median(lhrs.map((lhr) => lhr.environment.benchmarkIndex)),
    values: Object.fromEntries(METRICS.map((m) => [m.id, median(lhrs.map((lhr) => lhr.audits[m.id].numericValue))])),
  };
});

const header = `| Median of ${runs} warm runs | ${measured.map((m) => m.name).join(' | ')} |`;
const lines = [
  `### Lighthouse: /setpoint-beach-tennis/${page}`,
  '',
  header,
  `|---|${measured.map(() => '---:').join('|')}|`,
  ...METRICS.map((m) => `| ${m.label} | ${measured.map((b) => m.format(b.values[m.id])).join(' | ')} |`),
  `| Runner benchmarkIndex | ${measured.map((b) => Math.round(b.benchmark)).join(' | ')} |`,
  '',
  `Absolute limits (lighthouserc.cjs): ${assertStatus === 0 ? 'passed' : 'failed, see the job log'}.`,
];

let regressed = false;
if (measured.length === 2) {
  const [pr, base] = measured;
  const prTbt = pr.values['total-blocking-time'];
  const baseTbt = base.values['total-blocking-time'];
  const limit = Math.max(baseTbt * TBT_RATIO, baseTbt + TBT_FLOOR_MS);
  regressed = prTbt > limit;
  lines.push(
    `TBT against the base build on this runner: ${Math.round(prTbt)} ms, limit ${Math.round(limit)} ms ` +
      `(base ${Math.round(baseTbt)} ms, +${Math.round((TBT_RATIO - 1) * 100)}% and +${TBT_FLOOR_MS} ms): ` +
      `${regressed ? 'REGRESSED' : 'passed'}.`,
  );
} else {
  lines.push('No base build given: TBT is only reported (lighthouserc.cjs warns on it).');
}

const summary = `${lines.join('\n')}\n`;
console.log(`\n${summary}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

process.exit(assertStatus !== 0 || regressed ? 1 : 0);
