#!/usr/bin/env node
/**
 * Raw-text ratchet (part of `npm run i18n:check`). Every word a person reads lives in `public/i18n/**` and reaches the
 * screen through a Transloco key. This script fails when Portuguese text is written in code instead:
 *
 *  1. templates (`*.html` and `template:` literals): text between tags, and literal `aria-label`, `title`, `alt`,
 *     `placeholder` attributes, outside `{{ }}` and control-flow syntax;
 *  2. string literals in non-spec `*.ts` files that contain a Portuguese accent (ã õ ç á é í ó ú â ê ô à).
 *
 * Files listed in `PENDING` are still to be moved to keys (C1b to C1d): the list only shrinks. A file that no longer
 * needs its entry fails the check too, so the entry is removed in the same change.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src/app');

/** Words that are the brand or symbols, not text to translate. */
const ALLOWED_WORDS = new Set(['SETPOINT', 'BEACH', 'TENNIS', 'SP', 'VS', 'PWA']);
/** Files that may keep Portuguese text for now (see the header). */
const PENDING = new Set([
  'src/app/core/qualification.service.ts',
  'src/app/core/share-card.service.ts',
  'src/app/core/path-card.service.ts',
  'src/app/core/tournament-report.service.ts',
  'src/app/core/schedule.service.ts',
  'src/app/core/group-schedule.service.ts',
  'src/app/core/finals.service.ts',
  'src/app/core/avatar.service.ts',
  'src/app/core/storage.service.ts',
  'src/app/core/final-live-score.ts',
  'src/app/core/adapters/supabase/supabase-feed.ts',
  'src/app/core/adapters/supabase/supabase-client.ts',
  'src/app/domain/tournament-view/group-tables.ts',
  'src/app/domain/tournament-setup/setup-rules.ts',
]);
/** Test support and data: text there is sample data, not what the app shows. */
const IGNORED = [/\.spec\.ts$/, /\/testing\//, /\.fakes?\.ts$/, /\.contract\.ts$/];

const ACCENT = /[ãõçáéíóúâêôà]/i;

function* walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Removes `@if (...)`, `@for (...)` and the like, including conditions with nested parentheses, and `@else`. */
function stripControlFlow(source) {
  let result = '';
  for (let i = 0; i < source.length; i++) {
    const match = /^@(if|else if|else|for|switch|case|default|empty|defer|placeholder|loading|error)\b/.exec(
      source.slice(i, i + 16),
    );
    if (!match) {
      result += source[i];
      continue;
    }
    i += match[0].length - 1;
    let j = i + 1;
    while (source[j] === ' ') j++;
    if (source[j] === '(') {
      let depth = 0;
      for (; j < source.length; j++) {
        if (source[j] === '(') depth++;
        if (source[j] === ')' && --depth === 0) break;
      }
      i = j;
    }
    result += ' ';
  }
  return result;
}

/** Text of a template that a person would read, with the markup, bindings and control flow removed. */
function templateProblems(source) {
  const found = [];
  const cleaned = stripControlFlow(
    source
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/\{\{[\s\S]*?\}\}/g, ' ')
      .replace(/@let\s+[^;]+;/g, ' ')
      .replace(/&[a-z]+;/g, ' '),
  );
  for (const [, attribute, value] of cleaned.matchAll(/\s(aria-label|title|alt|placeholder)="([^"]+)"/g)) {
    if (hasWords(value)) found.push(`${attribute}="${value}"`);
  }
  // A tag ends at the first `>` outside quotes: bindings such as `[class.down]="a > 0"` contain one.
  const text = cleaned.replace(/<\/?[a-zA-Z][^\s>\/]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g, '\u0000').split('\u0000');
  for (const piece of text) {
    const trimmed = piece.replace(/[{}@]/g, ' ').trim();
    if (hasWords(trimmed)) found.push(trimmed.slice(0, 60));
  }
  return found;
}

function hasWords(text) {
  return (text.match(/[A-Za-zÀ-ÿ]{2,}/g) ?? []).some((word) => !ALLOWED_WORDS.has(word));
}

/** String literals with a Portuguese accent in TypeScript (comments and templates are skipped). */
function literalProblems(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found = [];
  for (const [, , value] of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    if (ACCENT.test(value) && /[a-zà-ÿ]{3,}/i.test(value)) found.push(value.slice(0, 60));
  }
  return found;
}

const failures = [];
const stale = new Set(PENDING);

for (const path of walk(SRC)) {
  const file = relative(ROOT, path);
  if (IGNORED.some((pattern) => pattern.test(path))) continue;
  const source = readFileSync(path, 'utf8');
  let problems = [];
  if (path.endsWith('.html')) problems = templateProblems(source);
  else if (path.endsWith('.ts')) {
    for (const [, template] of source.matchAll(/\btemplate:\s*`([\s\S]*?)`/g))
      problems.push(...templateProblems(template));
    const withoutTemplates = source.replace(/\btemplate:\s*`[\s\S]*?`/g, '');
    problems.push(...literalProblems(withoutTemplates));
  } else continue;
  if (PENDING.has(file)) {
    if (problems.length) stale.delete(file);
    continue;
  }
  for (const problem of problems) failures.push(`${file}: ${problem}`);
}

const messages = [];
if (failures.length) messages.push(`Raw text in code (use a Transloco key):\n  ${failures.join('\n  ')}`);
if (stale.size)
  messages.push(
    `No raw text left in these files, remove them from PENDING in scripts/check-raw-text.mjs:\n  ${[...stale].join('\n  ')}`,
  );
if (messages.length) {
  console.error(messages.join('\n\n'));
  process.exit(1);
}
console.log('No raw text found outside the pending files.');
