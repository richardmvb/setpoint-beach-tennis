#!/usr/bin/env node
/**
 * Migration rules (see docs/professionalization-plan.md, standards #10 and #25):
 * - forward-only: a migration already on the base branch is never modified, renamed or deleted;
 * - vendor isolation: migrations newer than the app.current_user_id() helper call that helper instead of auth.uid() / auth.jwt().
 * Usage: node scripts/check-migrations.cjs [baseRef]   (baseRef defaults to origin/main)
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const baseRef = process.argv[2] || 'origin/main';
const HELPER_MIGRATION = '202611120001_security_hardening.sql';
const problems = [];

let changes = '';
try {
  changes = execSync(`git diff --name-status --no-renames ${baseRef}...HEAD -- supabase/migrations`, {
    encoding: 'utf8',
  });
} catch {
  console.warn(`Could not diff against ${baseRef}; skipping the immutability check.`);
}
for (const line of changes.split('\n').filter(Boolean)) {
  const [status, file] = line.split('\t');
  if (status !== 'A')
    problems.push(`${file}: migrations on ${baseRef} are immutable (status ${status}); add a new migration instead`);
}

for (const file of fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  if (!/^\d{12}_[a-z0-9_]+\.sql$/.test(file))
    problems.push(`${file}: name must be <12-digit timestamp>_<snake_case>.sql`);
  if (file <= HELPER_MIGRATION) continue;
  const body = fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '');
  if (/\bauth\.(uid|jwt)\s*\(/i.test(body))
    problems.push(`${file}: use app.current_user_id() instead of auth.uid()/auth.jwt()`);
}

if (problems.length) {
  console.error(`Migration check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Migrations are forward-only and vendor-neutral.');
