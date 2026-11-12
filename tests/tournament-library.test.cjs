const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore, MemoryStorage } = require('./helpers-ts.cjs');

const { TournamentLibrary, libraryId } = loadCore('tournament-library');

function tournament(id, overrides = {}) {
  return {
    version: 1,
    name: `Torneio ${id}`,
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players: [{ id: 'p1', name: 'Ana', photoDataUrl: 'data:image/webp;base64,AAAA' }],
    rounds: [
      {
        number: 1,
        restingPlayerIds: [],
        matches: [
          { id: 'm1', court: 1, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], scoreA: 4, scoreB: 2 },
          { id: 'm2', court: 2, teamA: ['p5', 'p6'], teamB: ['p7', 'p8'], scoreA: null, scoreB: null },
        ],
      },
    ],
    createdAt: '2026-11-09T09:00:00.000Z',
    startedAt: '2026-11-09T09:30:00.000Z',
    analyticsId: id,
    hostingMode: 'local',
    tournamentMode: 'super',
    ...overrides,
  };
}

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 9, 10, 0, tick++));
const create = (storage = new MemoryStorage(), max = 30) => new TournamentLibrary(storage, undefined, max, clock);

test('só guarda torneios iniciados e identifica local e compartilhado', () => {
  const library = create();
  assert.equal(library.save(tournament('a', { rounds: [] })), null);
  assert.equal(library.save(tournament(undefined)), null);
  assert.equal(libraryId({ hostingMode: 'shared', sharedTournamentId: 'x' }), 'shared-x');
  assert.equal(libraryId({ hostingMode: 'shared' }), null);
  const entry = library.save(tournament('a'));
  assert.equal(entry.id, 'a');
  assert.equal(entry.matchesCompleted, 1);
  assert.equal(entry.matchesTotal, 2);
  assert.equal(entry.phase, 'qualifying');
  assert.equal(entry.archivePending, true);
});

test('o torneio sobrevive a novas versões, é reaberto sem fotos e não duplica', () => {
  const storage = new MemoryStorage();
  create(storage).save(tournament('a'));
  const later = create(storage); // novo carregamento do app
  const reopened = later.load('a');
  assert.equal(reopened.rounds[0].matches[0].scoreA, 4);
  assert.equal(reopened.players[0].photoDataUrl, undefined);
  later.save(tournament('a', { finishedAt: '2026-11-09T12:00:00.000Z' }));
  assert.equal(later.list().length, 1);
  assert.equal(later.list()[0].phase, 'finished');
});

test('salvar o mesmo estado não renova o torneio nem refaz o envio à nuvem', () => {
  const library = create();
  const first = library.save(tournament('a'));
  library.markArchived('a', first.updatedAt);
  const again = library.save(tournament('a'));
  assert.equal(again.updatedAt, first.updatedAt);
  assert.equal(library.pendingArchives().length, 0);
});

test('uma edição durante o envio mantém o torneio pendente', () => {
  const library = create();
  const sent = library.save(tournament('a'));
  const edited = library.save(tournament('a', { name: 'Editado' }));
  library.markArchived('a', sent.updatedAt);
  assert.equal(library.pendingArchives()[0].updatedAt, edited.updatedAt);
  library.markArchived('a', edited.updatedAt);
  assert.equal(library.pendingArchives().length, 0);
  library.requeue('a');
  assert.equal(library.pendingArchives().length, 1);
});

test('torneios compartilhados nunca ficam na fila de envio', () => {
  const library = create();
  library.save(tournament(undefined, { hostingMode: 'shared', sharedTournamentId: 'abc', analyticsId: undefined }));
  assert.equal(library.list()[0].id, 'shared-abc');
  assert.equal(library.pendingArchives().length, 0);
  library.requeue('shared-abc');
  assert.equal(library.pendingArchives().length, 0);
});

test('lista do mais recente ao mais antigo, aplica o limite e exclui', () => {
  const library = create(new MemoryStorage(), 3);
  for (const id of ['a', 'b', 'c', 'd']) library.save(tournament(id));
  assert.deepEqual(
    library.list().map((entry) => entry.id),
    ['d', 'c', 'b'],
  );
  assert.equal(library.load('a'), null);
  library.remove('c');
  assert.deepEqual(
    library.list().map((entry) => entry.id),
    ['d', 'b'],
  );
});

test('com o armazenamento cheio, descarta os mais antigos e preserva o atual', () => {
  const size = JSON.stringify(tournament('a')).length;
  const storage = new MemoryStorage(size * 2 + 1200);
  const library = create(storage);
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(library.save(tournament(id)), id);
  const ids = library.list().map((entry) => entry.id);
  assert.equal(ids[0], 'd');
  assert.ok(ids.length < 4 && ids.length >= 1);
  assert.ok(library.load('d'));
});

test('um índice corrompido não derruba o app', () => {
  const storage = new MemoryStorage();
  storage.setItem('setpoint.library.v1', '{not json');
  const library = create(storage);
  assert.deepEqual(library.list(), []);
  assert.ok(library.save(tournament('a')));
});

test('o histórico respeita o orçamento de bytes e nunca descarta o torneio sendo salvo', () => {
  const one = JSON.stringify(tournament('a')).length;
  const library = new TournamentLibrary(new MemoryStorage(), undefined, 30, clock, one * 2 + 10);
  for (const id of ['a', 'b', 'c', 'd']) library.save(tournament(id));
  const ids = library.list().map((entry) => entry.id);
  assert.equal(ids[0], 'd');
  assert.ok(ids.length <= 2, `esperava no máximo 2 torneios, havia ${ids.length}`);
  assert.equal(library.load('a'), null);
  const tiny = new TournamentLibrary(new MemoryStorage(), undefined, 30, clock, 10);
  assert.ok(tiny.save(tournament('x')));
  assert.equal(tiny.list().length, 1);
});
