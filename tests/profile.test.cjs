const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const { parseProfile, serializeProfile, profileAutoJoin, shouldPromptProfile } = loadCore('profile');

test('perfil vazio ou inválido volta ao padrão (entrar automaticamente ligado)', () => {
  assert.deepEqual(parseProfile(null), { name: '', autoJoin: true });
  assert.deepEqual(parseProfile('{oops'), { name: '', autoJoin: true });
  assert.deepEqual(parseProfile('"texto"'), { name: '', autoJoin: true });
});

test('sanitiza nome, foto e categoria', () => {
  const profile = parseProfile(JSON.stringify({ name: `  ${'a'.repeat(60)} `, photoDataUrl: 'javascript:alert(1)', gender: 'x', autoJoin: false }));
  assert.equal(profile.name.length, 40);
  assert.equal(profile.photoDataUrl, undefined);
  assert.equal(profile.gender, undefined);
  assert.equal(profile.autoJoin, false);
  const round = parseProfile(serializeProfile({ name: 'Ana', photoDataUrl: 'data:image/webp;base64,AA', gender: 'female', autoJoin: true }));
  assert.deepEqual(round, { name: 'Ana', autoJoin: true, photoDataUrl: 'data:image/webp;base64,AA', gender: 'female' });
});

test('entra automaticamente só quando ligado, com nome, vaga e sem duplicar', () => {
  const ana = { name: 'Ana', autoJoin: true, photoDataUrl: 'data:image/webp;base64,AA' };
  assert.deepEqual(profileAutoJoin(ana, [], 8, false), { player: { name: 'Ana', photoDataUrl: 'data:image/webp;base64,AA' } });
  assert.deepEqual(profileAutoJoin({ ...ana, autoJoin: false }, [], 8, false), { skipped: 'off' });
  assert.deepEqual(profileAutoJoin({ name: '  ', autoJoin: true }, [], 8, false), { skipped: 'no-name' });
  assert.deepEqual(profileAutoJoin(ana, [{ id: '1', name: 'ana' }], 8, false), { skipped: 'present' });
  assert.deepEqual(profileAutoJoin(ana, [{ id: '1', name: 'Bia' }], 1, false), { skipped: 'full' });
});

test('torneio misto exige categoria no perfil', () => {
  assert.deepEqual(profileAutoJoin({ name: 'Caio', autoJoin: true }, [], 8, true), { skipped: 'needs-gender' });
  assert.deepEqual(profileAutoJoin({ name: 'Caio', autoJoin: true, gender: 'male' }, [], 8, true), { player: { name: 'Caio', gender: 'male' } });
  assert.deepEqual(profileAutoJoin({ name: 'Caio', autoJoin: true, gender: 'male' }, [], 8, false), { player: { name: 'Caio' } });
});

test('o perfil é oferecido uma única vez, e só enquanto estiver vazio', () => {
  assert.equal(shouldPromptProfile({ name: '', autoJoin: true }, false), true);
  assert.equal(shouldPromptProfile({ name: '   ', autoJoin: true }, false), true);
  assert.equal(shouldPromptProfile({ name: '', autoJoin: true }, true), false);
  assert.equal(shouldPromptProfile({ name: 'Ana', autoJoin: true }, false), false);
});
