const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const { matchesPhrase } = loadCore('dialog.service', {
  '@angular/core': { Injectable: () => target => target },
  sweetalert2: {}
});

test('finalizar só é aceito quando a palavra é digitada, ignorando caixa e espaços', () => {
  assert.equal(matchesPhrase('finalizar', 'finalizar'), true);
  assert.equal(matchesPhrase('  Finalizar ', 'finalizar'), true);
  assert.equal(matchesPhrase('FINALIZAR', 'finalizar'), true);
  assert.equal(matchesPhrase('finaliza', 'finalizar'), false);
  assert.equal(matchesPhrase('finalizar torneio', 'finalizar'), false);
  assert.equal(matchesPhrase('', 'finalizar'), false);
});

test('nenhum confirm nativo restou no app', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const files = ['app.component.ts', 'core/storage.service.ts', 'core/supabase.service.ts'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');
    assert.doesNotMatch(source, /(?<![\w.])(confirm|alert|prompt)\(/, `${file} usa diálogo nativo`);
  }
});
