const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const docs = fs.readFileSync(path.join(root, 'docs/analytics.md'), 'utf8');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

test('todo evento do PostHog capturado no código está documentado em docs/analytics.md', () => {
  const events = new Set();
  for (const file of sourceFiles(path.join(root, 'src'))) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/capture\('([a-z_]+)'/g)) events.add(match[1]);
  }
  assert.ok(events.size >= 30, `esperava encontrar os eventos, achei ${events.size}`);
  const missing = [...events].filter((name) => !docs.includes(`\`${name}\``)).sort();
  assert.deepEqual(missing, [], `eventos sem documentação: ${missing.join(', ')}`);
});

test('eventos não carregam texto livre: propriedades são enums, números ou booleanos', () => {
  const risky = [];
  for (const file of sourceFiles(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/capture\('([a-z_]+)',\s*\{([^}]*)\}/g)) {
      if (/\b(name|email|title|text|message|label)\s*:/.test(match[2]))
        risky.push(`${match[1]} em ${path.relative(root, file)}`);
    }
  }
  assert.deepEqual(risky, [], 'propriedades com possível texto livre/PII');
});
