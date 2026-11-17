import { describe, expect, it } from 'vitest';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import type { PlayerStanding } from '../../core/models';
import { canGenerateFinals, earlyFinalsReady, withFinishedAt } from './finals';

const row = (matchesPlayed: number): PlayerStanding => ({
  playerId: 'x',
  name: 'x',
  setsWon: 0,
  gamesFor: 0,
  gamesAgainst: 0,
  gameBalance: 0,
  rests: 0,
  matchesPlayed,
});

const complete = tournamentState({
  players: namedPlayers(8),
  rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 1), match('m2', ['p5', 'p6'], ['p7', 'p8'], 4, 2)])],
});

describe('canGenerateFinals', () => {
  it('needs a complete schedule, eight players, no finals and permission to edit', () => {
    expect(canGenerateFinals(complete, [], true)).toBe(true);
    expect(canGenerateFinals(complete, [], false)).toBe(false);
    expect(
      canGenerateFinals({ ...complete, finals: { matches: [], complete: false, podiumPlayerIds: [] } }, [], true),
    ).toBe(false);
    expect(canGenerateFinals({ ...complete, players: namedPlayers(6) }, [], true)).toBe(false);
  });

  it('waits while a match is unplayed', () => {
    const open = { ...complete, rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'])])] };
    expect(canGenerateFinals(open, [], true)).toBe(false);
  });

  it('is false without a schedule', () => {
    expect(canGenerateFinals({ ...complete, rounds: [] }, [], true)).toBe(false);
  });
});

describe('earlyFinalsReady', () => {
  const super24 = tournamentState({
    size: 24,
    courts: 3,
    doublesFormat: 'mixed',
    earlyFinalsEnabled: true,
    players: namedPlayers(12),
  });

  it('holds when every player has played the same number of matches', () => {
    expect(earlyFinalsReady(super24, [row(5), row(5)])).toBe(true);
    expect(earlyFinalsReady(super24, [row(5), row(4)])).toBe(false);
    expect(earlyFinalsReady(super24, [row(0), row(0)])).toBe(false);
    expect(earlyFinalsReady(super24, [])).toBe(false);
  });

  it('needs the option to be on and available', () => {
    expect(earlyFinalsReady({ ...super24, earlyFinalsEnabled: false }, [row(5)])).toBe(false);
    expect(earlyFinalsReady({ ...super24, courts: 6 }, [row(5)])).toBe(false);
  });
});

describe('withFinishedAt', () => {
  it('returns a new tournament with the end time', () => {
    const next = withFinishedAt(complete, '2026-11-17T12:00:00.000Z');
    expect(next.finishedAt).toBe('2026-11-17T12:00:00.000Z');
    expect(complete.finishedAt).toBeUndefined();
  });
});
