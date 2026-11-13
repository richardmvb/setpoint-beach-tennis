import { describe, expect, it } from 'vitest';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import {
  defaultFixedPairs,
  fixedPairsMode,
  isEarlyFinalsOptionAvailable,
  mixedFinalistCount,
  usesMixedFinalBracket,
  usesMixedFinals,
} from './format';

const super24Mixed = tournamentState({ size: 24, courts: 3, doublesFormat: 'mixed', tournamentMode: 'super' });

describe('tournament format', () => {
  it('has fixed pairs only in groups with the fixed format', () => {
    expect(fixedPairsMode(tournamentState({ tournamentMode: 'groups', groupFormat: 'fixed' }))).toBe(true);
    expect(fixedPairsMode(tournamentState({ tournamentMode: 'groups', groupFormat: 'rotating' }))).toBe(false);
    expect(fixedPairsMode(tournamentState({ tournamentMode: 'super', groupFormat: 'fixed' }))).toBe(false);
  });

  it('offers early mixed finals only for the Super 24 mixed on 3 courts', () => {
    expect(isEarlyFinalsOptionAvailable(super24Mixed)).toBe(true);
    expect(isEarlyFinalsOptionAvailable({ ...super24Mixed, courts: 6 })).toBe(false);
    expect(isEarlyFinalsOptionAvailable({ ...super24Mixed, doublesFormat: 'open' })).toBe(false);
    expect(isEarlyFinalsOptionAvailable({ ...super24Mixed, size: 12 })).toBe(false);
    expect(isEarlyFinalsOptionAvailable({ ...super24Mixed, tournamentMode: 'groups' })).toBe(false);
  });

  it('uses the mixed finals when they are turned on, as a knockout unless direct is chosen', () => {
    expect(usesMixedFinals(super24Mixed)).toBe(false);
    const enabled = { ...super24Mixed, earlyFinalsEnabled: true };
    expect(usesMixedFinals(enabled)).toBe(true);
    expect(usesMixedFinalBracket(enabled)).toBe(true);
    expect(mixedFinalistCount(enabled)).toBe(8);
    const direct = { ...enabled, mixedFinalFormat: 'direct' as const };
    expect(usesMixedFinalBracket(direct)).toBe(false);
    expect(mixedFinalistCount(direct)).toBe(4);
    expect(mixedFinalistCount(super24Mixed)).toBe(4);
  });
});

describe('defaultFixedPairs', () => {
  const fixedGroups = { tournamentMode: 'groups' as const, groupFormat: 'fixed' as const, size: 8 as const };

  it('pairs players in registration order', () => {
    const state = tournamentState({ ...fixedGroups, players: namedPlayers(8) });
    expect(defaultFixedPairs(state)).toEqual([
      ['p1', 'p2'],
      ['p3', 'p4'],
      ['p5', 'p6'],
      ['p7', 'p8'],
    ]);
  });

  it('pairs a man and a woman by position in mixed doubles', () => {
    const players = namedPlayers(8).map((player, i) => ({
      ...player,
      gender: i < 4 ? ('male' as const) : ('female' as const),
    }));
    const state = tournamentState({ ...fixedGroups, doublesFormat: 'mixed', players });
    expect(defaultFixedPairs(state)).toEqual([
      ['p1', 'p5'],
      ['p2', 'p6'],
      ['p3', 'p7'],
      ['p4', 'p8'],
    ]);
  });

  it('is empty until the roster is full and balanced, and outside fixed pairs', () => {
    expect(defaultFixedPairs(tournamentState({ ...fixedGroups, players: namedPlayers(6) }))).toEqual([]);
    const unbalanced = namedPlayers(8).map((player, i) => ({
      ...player,
      gender: i < 5 ? ('male' as const) : ('female' as const),
    }));
    expect(defaultFixedPairs(tournamentState({ ...fixedGroups, doublesFormat: 'mixed', players: unbalanced }))).toEqual(
      [],
    );
    expect(defaultFixedPairs(tournamentState({ size: 8, players: namedPlayers(8) }))).toEqual([]);
  });
});
