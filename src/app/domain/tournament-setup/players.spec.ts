import { describe, expect, it } from 'vitest';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import { addPlayer, addPlayers, removePlayer, setPlayerGender, swapFixedPair } from './players';

const input = (name: string, gender: '' | 'male' | 'female' = '', avatar = '') => ({ name, gender, avatar });

describe('adding an athlete', () => {
  it('adds a trimmed name with its photo and keeps the order', () => {
    const result = addPlayer(tournamentState(), input('  Ana ', '', 'data:image/png;base64,x'), 'a1');
    expect(result).toMatchObject({
      state: { players: [{ id: 'a1', name: 'Ana', photoDataUrl: 'data:image/png;base64,x' }] },
    });
  });

  it('says why not, in the order the screen checks', () => {
    expect(addPlayer(tournamentState(), input('  '), 'x')).toEqual({ error: 'empty' });
    expect(addPlayer(tournamentState({ doublesFormat: 'mixed' }), input('Ana'), 'x')).toEqual({ error: 'needsGender' });
    const started = tournamentState({ rounds: [{ number: 1, matches: [], restingPlayerIds: [] }] });
    expect(addPlayer(started, input('Ana'), 'x')).toEqual({ error: 'locked' });
    expect(addPlayer(tournamentState({ hostingMode: 'shared' }), input('Ana'), 'x')).toEqual({ error: 'shared' });
    expect(addPlayer(tournamentState({ players: namedPlayers(8) }), input('Zé'), 'x')).toEqual({ error: 'full' });
    expect(addPlayer(tournamentState({ players: namedPlayers(2) }), input('ana'), 'x')).toEqual({ error: 'duplicate' });
  });

  it('keeps the category in mixed doubles and refills the fixed pairs when the roster is complete', () => {
    const base = tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'fixed',
      size: 8,
      players: namedPlayers(7),
    });
    const result = addPlayer(base, input('Oito'), 'p8');
    expect(result).toMatchObject({
      state: {
        fixedPairs: [
          ['p1', 'p2'],
          ['p3', 'p4'],
          ['p5', 'p6'],
          ['p7', 'p8'],
        ],
      },
    });
    const mixed = addPlayer(tournamentState({ doublesFormat: 'mixed' }), input('Ana', 'female'), 'a');
    expect(mixed).toMatchObject({ state: { players: [{ id: 'a', name: 'Ana', gender: 'female' }] } });
  });
});

describe('the roster', () => {
  it('removes an athlete from a local tournament only', () => {
    const state = tournamentState({ players: namedPlayers(3) });
    expect(removePlayer(state, 'p2')).toMatchObject({ state: { players: [{ id: 'p1' }, { id: 'p3' }] } });
    expect(removePlayer({ ...state, hostingMode: 'shared' }, 'p2')).toEqual({ error: 'shared' });
    expect(removePlayer({ ...state, rounds: [{ number: 1, matches: [], restingPlayerIds: [] }] }, 'p2')).toEqual({
      error: 'locked',
    });
  });

  it('changes a category only in mixed doubles before the draw', () => {
    const mixed = tournamentState({ doublesFormat: 'mixed', players: namedPlayers(2, 'male') });
    const changed = setPlayerGender(mixed, 'p2', 'female');
    expect(changed.players[1].gender).toBe('female');
    expect(mixed.players[1].gender).toBe('male');
    expect('gender' in setPlayerGender(mixed, 'p2', '').players[1]).toBe(false);
    const open = tournamentState({ players: namedPlayers(2) });
    expect(setPlayerGender(open, 'p2', 'female')).toBe(open);
  });

  it('adds a list in one go', () => {
    const state = addPlayers(
      tournamentState(),
      [
        { name: ' Ana ', gender: '' },
        { name: 'Bia', gender: '' },
      ],
      ['a', 'b'],
    );
    expect(state.players).toEqual([
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ]);
  });
});

describe('fixed pairs', () => {
  const pairs = (): ReturnType<typeof tournamentState> =>
    tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'fixed',
      players: namedPlayers(8),
      fixedPairs: [
        ['p1', 'p2'],
        ['p3', 'p4'],
        ['p5', 'p6'],
        ['p7', 'p8'],
      ],
    });

  it('swaps the previous holder into the other pair', () => {
    expect(swapFixedPair(pairs(), 0, 0, 'p3')).toMatchObject({
      state: {
        fixedPairs: [
          ['p3', 'p2'],
          ['p1', 'p4'],
          ['p5', 'p6'],
          ['p7', 'p8'],
        ],
      },
    });
  });

  it('keeps a pair with one man and one woman in mixed doubles', () => {
    const men = namedPlayers(4, 'male').map((p) => ({ ...p, id: `m${p.id}` }));
    const women = namedPlayers(4, 'female').map((p) => ({ ...p, id: `f${p.id}` }));
    const state = tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'fixed',
      doublesFormat: 'mixed',
      players: [...men, ...women],
      fixedPairs: [
        ['mp1', 'fp1'],
        ['mp2', 'fp2'],
        ['mp3', 'fp3'],
        ['mp4', 'fp4'],
      ],
    });
    expect(swapFixedPair(state, 0, 1, 'mp2')).toEqual({ error: 'mixedPair' });
    expect(swapFixedPair(state, 0, 1, 'fp2')).not.toHaveProperty('error');
  });
});
