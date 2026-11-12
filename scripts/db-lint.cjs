#!/usr/bin/env node
/**
 * Runs Supabase's own security and performance lints (splinter, the queries behind the dashboard
 * Advisors) and `supabase db lint` against the local database started by `supabase start`.
 *
 * Gate: any ERROR fails. A WARN fails unless it is one of the two lints that describe the design of this
 * app (all business access goes through SECURITY DEFINER RPCs); who may call them is pinned exactly in
 * supabase/tests/security.test.sql. INFO lints (indexes) are printed only.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DESIGN_LINTS = new Set([
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
]);
const DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = fs.readFileSync(path.join(root, 'supabase/lint/splinter.sql'), 'utf8');

function runSql(query) {
  const hasPsql = spawnSync('psql', ['--version'], { stdio: 'ignore' }).status === 0;
  const args = ['-At', '-F', '|', '-c', query];
  if (hasPsql) return execFileSync('psql', [DB_URL, ...args], { encoding: 'utf8' });
  return execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_setpoint-beach-tennis', 'psql', '-U', 'postgres', '-d', 'postgres', ...args],
    {
      encoding: 'utf8',
    },
  );
}

const rows = runSql(sql)
  .split('\n')
  .map((line) => line.split('|'))
  .filter((cols) => ['ERROR', 'WARN', 'INFO'].includes(cols[2]));

const failures = rows.filter(([name, , level]) => level === 'ERROR' || (level === 'WARN' && !DESIGN_LINTS.has(name)));
for (const [name, , level, , , , detail] of rows) {
  const mark = failures.some((f) => f[0] === name && f[6] === detail) ? 'FAIL' : level === 'INFO' ? 'info' : 'ok  ';
  console.log(`${mark} ${level.padEnd(5)} ${name} ${detail ?? ''}`.trim());
}
if (failures.length) {
  console.error(`\n${failures.length} database lint violation(s). Fix the migration; do not add exceptions.`);
  process.exit(1);
}

const lint = spawnSync('npx', ['supabase', 'db', 'lint', '--level', 'warning', '--fail-on', 'warning'], {
  stdio: 'inherit',
  cwd: root,
});
process.exit(lint.status ?? 1);
