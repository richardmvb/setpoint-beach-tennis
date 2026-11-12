import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Specs run from the workspace root (ng test), so the repo root is the working directory.
const root = process.cwd();
const docs = readFileSync(join(root, 'docs/analytics.md'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('analytics catalog', () => {
  it('todo evento do PostHog capturado no código está documentado em docs/analytics.md', () => {
    const events = new Set<string>();
    for (const file of sourceFiles(join(root, 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/capture\('([a-z_]+)'/g)) events.add(match[1]);
    }
    expect(events.size, `esperava encontrar os eventos, achei ${events.size}`).toBeGreaterThanOrEqual(30);
    const missing = [...events].filter((name) => !docs.includes(`\`${name}\``)).sort();
    expect(missing, `eventos sem documentação: ${missing.join(', ')}`).toStrictEqual([]);
  });

  it('eventos não carregam texto livre: propriedades são enums, números ou booleanos', () => {
    const risky: string[] = [];
    for (const file of sourceFiles(join(root, 'src'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/capture\('([a-z_]+)',\s*\{([^}]*)\}/g)) {
        if (/\b(name|email|title|text|message|label)\s*:/.test(match[2]))
          risky.push(`${match[1]} em ${relative(root, file)}`);
      }
    }
    expect(risky, 'propriedades com possível texto livre/PII').toStrictEqual([]);
  });
});
