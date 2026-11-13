import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PlayerStanding, TournamentState } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { createStandingsMemo, rankedStandingGroups, storedTieDrawOrder } from './standings';

const ids = (groups: PlayerStanding[][]): string[][] => groups.map((group) => group.map((row) => row.playerId));

/**
 * Six players (Ana p1 … Fabi p6), three scored rounds, worked out by hand:
 * - p3 and p5 win twice 4-3: 2 sets, 8-6. Nothing separates them (they never met), so they stay tied.
 * - p1 and p2 each win once and lose once 3-4/4-3: 1 set, 7-7. p2 beat p1 directly in round 1, so p2 ranks first
 *   although Ana comes before Bia alphabetically.
 * - p4 and p6 lose twice 3-4: 0 sets, 6-8, still tied.
 */
function sixPlayers(overrides: Partial<TournamentState> = {}): TournamentState {
  return tournamentState({
    size: 8,
    players: namedPlayers(6),
    rounds: [
      round(1, [match('m1', ['p2', 'p3'], ['p1', 'p4'], 4, 3)], ['p5', 'p6']),
      round(2, [match('m2', ['p1', 'p5'], ['p4', 'p6'], 4, 3)], ['p2', 'p3']),
      round(3, [match('m3', ['p3', 'p5'], ['p2', 'p6'], 4, 3), match('m4', ['p1', 'p4'], ['p2', 'p3'])], []),
    ],
    ...overrides,
  });
}

describe('rankedStandingGroups', () => {
  it('ranks by sets won, then game balance, then games won', () => {
    // p1+p2 beat p3+p4 4-1, then p1+p3 beat p2+p4 4-2.
    const state = tournamentState({
      players: namedPlayers(4),
      rounds: [
        round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1)]),
        round(2, [match('b', ['p1', 'p3'], ['p2', 'p4'], 4, 2)]),
      ],
    });
    const rows = rankedStandingGroups(state).flat();
    expect(rows.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows[0]).toMatchObject({ setsWon: 2, gamesFor: 8, gamesAgainst: 3, gameBalance: 5, matchesPlayed: 2 });
    expect(rows[1]).toMatchObject({ setsWon: 1, gamesFor: 6, gamesAgainst: 5, gameBalance: 1 });
    expect(rows[2]).toMatchObject({ setsWon: 1, gamesFor: 5, gamesAgainst: 6, gameBalance: -1 });
    expect(rows[3]).toMatchObject({ setsWon: 0, gamesFor: 3, gamesAgainst: 8, gameBalance: -5 });
  });

  it('breaks a tie by direct wins and keeps unresolved ties together, in name order', () => {
    expect(ids(rankedStandingGroups(sixPlayers()))).toEqual([['p3', 'p5'], ['p2'], ['p1'], ['p4', 'p6']]);
  });

  it('ignores unscored matches and counts rests', () => {
    const rows = rankedStandingGroups(sixPlayers()).flat();
    const ana = rows.find((row) => row.playerId === 'p1');
    // m4 (round 3) has no score; Ana rested in no round, Edu (p5) rested in round 1.
    expect(ana).toMatchObject({ matchesPlayed: 2, rests: 0 });
    expect(rows.find((row) => row.playerId === 'p5')?.rests).toBe(1);
  });

  it('orders a tie by the stored draw', () => {
    const state = sixPlayers({
      tieBreakDraws: [{ playerIds: ['p3', 'p5'], order: ['p5', 'p3'], createdAt: '2026-11-13T10:00:00.000Z' }],
    });
    expect(ids(rankedStandingGroups(state))[0]).toEqual(['p5', 'p3']);
  });
});

describe('storedTieDrawOrder', () => {
  it('finds the draw for the same players in any order, and only for exactly those players', () => {
    const state = sixPlayers({
      tieBreakDraws: [{ playerIds: ['p5', 'p3'], order: ['p5', 'p3'], createdAt: '2026-11-13T10:00:00.000Z' }],
    });
    const rows = rankedStandingGroups(state).flat();
    const pick = (...playerIds: string[]) => rows.filter((row) => playerIds.includes(row.playerId));
    expect(storedTieDrawOrder(state, pick('p3', 'p5'))).toEqual(['p5', 'p3']);
    expect(storedTieDrawOrder(state, pick('p3', 'p5', 'p1'))).toBeNull();
    expect(storedTieDrawOrder(tournamentState(), pick('p3', 'p5'))).toBeNull();
  });
});

describe('createStandingsMemo', () => {
  it('splits the ranking by gender', () => {
    const players = [...namedPlayers(2, 'male'), ...namedPlayers(4, 'female').slice(2)];
    const view = createStandingsMemo()(sixPlayers({ players: [...players, ...namedPlayers(6).slice(4)] }));
    expect(view.male.map((row) => row.playerId)).toEqual(['p2', 'p1']);
    expect(view.female.map((row) => row.playerId)).toEqual(['p3', 'p4']);
    expect(view.all).toHaveLength(6);
  });

  it('returns the same arrays while players, scores and draws are unchanged', () => {
    const memo = createStandingsMemo();
    const state = sixPlayers();
    const first = memo(state);
    expect(memo(state)).toBe(first);
    expect(memo(structuredClone(state))).toBe(first);
  });

  it('recomputes when a score, a name or a draw changes', () => {
    const memo = createStandingsMemo();
    const state = sixPlayers();
    const first = memo(state);

    const scored = structuredClone(state);
    scored.rounds[2].matches[1].scoreA = 4;
    scored.rounds[2].matches[1].scoreB = 0;
    const second = memo(scored);
    expect(second).not.toBe(first);

    const renamed = structuredClone(scored);
    renamed.players[0].name = 'Ana Clara';
    const third = memo(renamed);
    expect(third).not.toBe(second);
    expect(third.all.some((row) => row.name === 'Ana Clara')).toBe(true);

    const drawn = structuredClone(renamed);
    drawn.tieBreakDraws = [{ playerIds: ['p3', 'p5'], order: ['p5', 'p3'], createdAt: '2026-11-13T10:00:00.000Z' }];
    expect(memo(drawn)).not.toBe(third);
  });
});

describe('rankedStandingGroups (properties)', () => {
  const players = namedPlayers(8);
  const playerIds = players.map((player) => player.id);
  type Score = [number, number] | null;
  interface GeneratedRound {
    seats: string[];
    scores: [Score, Score];
  }
  /** Rounds of two matches over a random seating of the 8 players; a score may be missing (not played yet). */
  const rounds: fc.Arbitrary<GeneratedRound[]> = fc.array(
    fc.record({
      seats: fc.shuffledSubarray(playerIds, { minLength: 8, maxLength: 8 }),
      scores: fc.tuple(
        fc.option(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), { nil: null }),
        fc.option(fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })), { nil: null }),
      ),
    }),
    { maxLength: 7 },
  );

  function build(generated: GeneratedRound[]): TournamentState {
    return tournamentState({
      players,
      rounds: generated.map(({ seats, scores }, index) =>
        round(
          index + 1,
          [0, 1].map((court) => {
            const score = scores[court];
            const [a, b, c, d] = seats.slice(court * 4, court * 4 + 4);
            return match(`r${index}m${court}`, [a, b], [c, d], score?.[0] ?? null, score?.[1] ?? null);
          }),
        ),
      ),
    });
  }

  it('lists every player once, balances games, and keeps the ranking order', () => {
    fc.assert(
      fc.property(rounds, (generated) => {
        const state = build(generated);
        const groups = rankedStandingGroups(state);
        const rows = groups.flat();
        const scored = state.rounds.flatMap((r) => r.matches).filter((m) => m.scoreA !== null && m.scoreB !== null);

        expect(rows.map((row) => row.playerId).sort()).toEqual([...playerIds].sort());
        expect(rows.reduce((sum, row) => sum + row.gamesFor, 0)).toBe(
          rows.reduce((sum, row) => sum + row.gamesAgainst, 0),
        );
        expect(rows.reduce((sum, row) => sum + row.matchesPlayed, 0)).toBe(scored.length * 4);
        expect(rows.reduce((sum, row) => sum + row.setsWon, 0)).toBe(
          scored.filter((m) => m.scoreA !== m.scoreB).length * 2,
        );
        for (let i = 1; i < rows.length; i++) {
          const [before, after] = [rows[i - 1], rows[i]];
          const order =
            before.setsWon - after.setsWon ||
            before.gameBalance - after.gameBalance ||
            before.gamesFor - after.gamesFor;
          expect(order).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});
