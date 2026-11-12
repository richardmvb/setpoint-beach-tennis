import { describe, expect, it } from 'vitest';
import { TournamentState } from './models';
import { TournamentLibrary, libraryId } from './tournament-library';
import { MemoryStorage } from '../testing/memory-storage';

function tournament(id: string | undefined, overrides: Partial<TournamentState> = {}): TournamentState {
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
const clock = (): Date => new Date(Date.UTC(2026, 10, 9, 10, 0, tick++));
const create = (storage = new MemoryStorage(), max = 30): TournamentLibrary =>
  new TournamentLibrary(storage, undefined, max, clock);

describe('tournament library', () => {
  it('só guarda torneios iniciados e identifica local e compartilhado', () => {
    const library = create();
    expect(library.save(tournament('a', { rounds: [] }))).toBeNull();
    expect(library.save(tournament(undefined))).toBeNull();
    expect(libraryId({ hostingMode: 'shared', sharedTournamentId: 'x' })).toBe('shared-x');
    expect(libraryId({ hostingMode: 'shared' })).toBeNull();
    const entry = library.save(tournament('a'));
    expect(entry!.id).toBe('a');
    expect(entry!.matchesCompleted).toBe(1);
    expect(entry!.matchesTotal).toBe(2);
    expect(entry!.phase).toBe('qualifying');
    expect(entry!.archivePending).toBe(true);
  });

  it('o torneio sobrevive a novas versões, é reaberto sem fotos e não duplica', () => {
    const storage = new MemoryStorage();
    create(storage).save(tournament('a'));
    const later = create(storage); // novo carregamento do app
    const reopened = later.load('a');
    expect(reopened!.rounds[0].matches[0].scoreA).toBe(4);
    expect(reopened!.players[0].photoDataUrl).toBeUndefined();
    later.save(tournament('a', { finishedAt: '2026-11-09T12:00:00.000Z' }));
    expect(later.list().length).toBe(1);
    expect(later.list()[0].phase).toBe('finished');
  });

  it('salvar o mesmo estado não renova o torneio nem refaz o envio à nuvem', () => {
    const library = create();
    const first = library.save(tournament('a'))!;
    library.markArchived('a', first.updatedAt);
    const again = library.save(tournament('a'));
    expect(again!.updatedAt).toBe(first.updatedAt);
    expect(library.pendingArchives().length).toBe(0);
  });

  it('uma edição durante o envio mantém o torneio pendente', () => {
    const library = create();
    const sent = library.save(tournament('a'))!;
    const edited = library.save(tournament('a', { name: 'Editado' }))!;
    library.markArchived('a', sent.updatedAt);
    expect(library.pendingArchives()[0].updatedAt).toBe(edited.updatedAt);
    library.markArchived('a', edited.updatedAt);
    expect(library.pendingArchives().length).toBe(0);
    library.requeue('a');
    expect(library.pendingArchives().length).toBe(1);
  });

  it('torneios compartilhados nunca ficam na fila de envio', () => {
    const library = create();
    library.save(tournament(undefined, { hostingMode: 'shared', sharedTournamentId: 'abc', analyticsId: undefined }));
    expect(library.list()[0].id).toBe('shared-abc');
    expect(library.pendingArchives().length).toBe(0);
    library.requeue('shared-abc');
    expect(library.pendingArchives().length).toBe(0);
  });

  it('lista do mais recente ao mais antigo, aplica o limite e exclui', () => {
    const library = create(new MemoryStorage(), 3);
    for (const id of ['a', 'b', 'c', 'd']) library.save(tournament(id));
    expect(library.list().map((entry) => entry.id)).toStrictEqual(['d', 'c', 'b']);
    expect(library.load('a')).toBeNull();
    library.remove('c');
    expect(library.list().map((entry) => entry.id)).toStrictEqual(['d', 'b']);
  });

  it('com o armazenamento cheio, descarta os mais antigos e preserva o atual', () => {
    const size = JSON.stringify(tournament('a')).length;
    const storage = new MemoryStorage(size * 2 + 1200);
    const library = create(storage);
    for (const id of ['a', 'b', 'c', 'd']) expect(library.save(tournament(id)), id).toBeTruthy();
    const ids = library.list().map((entry) => entry.id);
    expect(ids[0]).toBe('d');
    expect(ids.length).toBeLessThan(4);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(library.load('d')).toBeTruthy();
  });

  it('um índice corrompido não derruba o app', () => {
    const storage = new MemoryStorage();
    storage.setItem('setpoint.library.v1', '{not json');
    const library = create(storage);
    expect(library.list()).toStrictEqual([]);
    expect(library.save(tournament('a'))).toBeTruthy();
  });

  it('o histórico respeita o orçamento de bytes e nunca descarta o torneio sendo salvo', () => {
    const one = JSON.stringify(tournament('a')).length;
    const library = new TournamentLibrary(new MemoryStorage(), undefined, 30, clock, one * 2 + 10);
    for (const id of ['a', 'b', 'c', 'd']) library.save(tournament(id));
    const ids = library.list().map((entry) => entry.id);
    expect(ids[0]).toBe('d');
    expect(ids.length, `esperava no máximo 2 torneios, havia ${ids.length}`).toBeLessThanOrEqual(2);
    expect(library.load('a')).toBeNull();
    const tiny = new TournamentLibrary(new MemoryStorage(), undefined, 30, clock, 10);
    expect(tiny.save(tournament('x'))).toBeTruthy();
    expect(tiny.list().length).toBe(1);
  });
});
