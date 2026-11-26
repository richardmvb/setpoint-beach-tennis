import { describe, expect, it } from 'vitest';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { fixedPairs8State, fixedPairsState, groups20State, sideAWins } from '../../testing/groups20';
import { createStandingsMemo } from '../tournament-view/standings';
import type { TournamentState } from '../../core/models';
import { openTies } from '../tournament-view/open-ties';
import { nextOpenTie, shuffledOrder, withTieDraw } from './tie-draw';

const view = (state: TournamentState) => createStandingsMemo()(state);
/** The ids of the next tie the finals wait for; empty when none. */
const nextTieIds = (state: TournamentState) =>
  nextOpenTie(state, view(state))?.players.map((row) => row.playerId) ?? [];
/** Fixed pairs: the tie between pairs (the list `openTies` reads for that format). */
const pairTieIds = (state: TournamentState) => openTies(state)[0]?.players.map((row) => row.playerId) ?? [];

/** Everybody ties: every match ends 4 to 4, so nothing separates the players. */
function allTied() {
  return tournamentState({
    players: namedPlayers(8),
    rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 4), match('m2', ['p5', 'p6'], ['p7', 'p8'], 4, 4)])],
  });
}

describe('nextOpenTie', () => {
  it('finds the players the rules could not separate, where the tie starts and how many places count', () => {
    const tie = nextOpenTie(allTied(), view(allTied()));
    expect(tie?.players).toHaveLength(8);
    expect(tie).toMatchObject({ firstPlace: 1, spots: 8, gender: null });
  });

  it('is null once the draw is recorded', () => {
    const state = allTied();
    const ids = state.players.map((p) => p.id);
    const drawn = withTieDraw(state, ids, [...ids].reverse(), '2026-11-17T10:00:00.000Z');
    expect(nextOpenTie(drawn, view(drawn))).toBeNull();
  });

  it('counts only the places inside the eight when the tie crosses the cut', () => {
    // p1 and p2 win, p11 and p12 lose; the eight others never played: they tie from the 3rd place to the 10th.
    // The partners p1 and p2 also tie with each other: that draw is already made.
    const state = withTieDraw(
      tournamentState({
        players: namedPlayers(12),
        rounds: [round(1, [match('m1', ['p1', 'p2'], ['p11', 'p12'], 4, 0)])],
      }),
      ['p1', 'p2'],
      ['p1', 'p2'],
      '2026-11-26T10:00:00.000Z',
    );
    const tie = nextOpenTie(state, view(state));
    expect(tie?.players.map((row) => row.playerId)).toEqual(['p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    expect(tie).toMatchObject({ firstPlace: 3, spots: 6 });
  });

  it('ignores a tie that only touches places after the eighth', () => {
    const state = tournamentState({
      players: namedPlayers(10),
      rounds: [
        round(1, [
          match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 0),
          match('m2', ['p5', 'p6'], ['p7', 'p8'], 4, 1),
          match('m3', ['p1', 'p3'], ['p2', 'p4'], 4, 2),
        ]),
      ],
    });
    // Players 9 and 10 never played: they tie with each other at the bottom, outside the finalists.
    const bottom = view(state).groups.find((group) => group.some((row) => row.playerId === 'p9'));
    expect(bottom?.length).toBeGreaterThan(1);
    expect(nextTieIds(state)).not.toContain('p9');
  });
});

describe('shuffledOrder', () => {
  it('is a permutation of the ids and leaves its input alone', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const order = shuffledOrder(ids, (max) => max - 1);
    expect([...order].sort()).toEqual(ids);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('follows the integer source', () => {
    // Always taking the last remaining slot swaps each position with itself: the order is unchanged.
    expect(shuffledOrder(['a', 'b', 'c'], (max) => max - 1)).toEqual(['a', 'b', 'c']);
    // Always taking slot 0 rotates the ids.
    expect(shuffledOrder(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a']);
  });
});

describe('withTieDraw', () => {
  it('appends the draw with sorted ids and leaves the input alone', () => {
    const state = allTied();
    const next = withTieDraw(state, ['p3', 'p1'], ['p3', 'p1'], '2026-11-17T10:00:00.000Z');
    expect(next.tieBreakDraws).toEqual([
      { playerIds: ['p1', 'p3'], order: ['p3', 'p1'], createdAt: '2026-11-17T10:00:00.000Z' },
    ]);
    expect(state.tieBreakDraws).toBeUndefined();
  });
});

describe('nextOpenTie, by format', () => {
  it('asks the qualification question in the 20-player format', () => {
    const twenty = groups20State(4, 5, sideAWins);
    expect(nextTieIds(twenty).length).toBeGreaterThan(1);
  });
});

describe('nextOpenTie, fixed pairs', () => {
  it('asks about tied pairs, never about partners: partners share every number and are one competitor', () => {
    // Every match ends 6-3 to side A: the pairs that won tie with each other, the pairs that lost with each other.
    const { state } = fixedPairs8State(3);
    const tied = nextOpenTie(state, view(state))!.players;
    expect(tied.length).toBeGreaterThan(1);
    // One representative per pair, with the pair's name: the draw is between pairs.
    expect(tied.every((row) => row.name.includes(' + '))).toBe(true);
    const partners = new Set(['p1,p2', 'p3,p4', 'p5,p6', 'p7,p8']);
    for (const row of tied) {
      const partnerKey = [...partners].find((key) => key.split(',').includes(row.playerId))!;
      const others = tied.filter((other) => other.playerId !== row.playerId).map((other) => other.playerId);
      expect(others.some((id) => partnerKey.split(',').includes(id))).toBe(false);
    }
  });

  it('is what the finals wait for in fixed pairs, instead of the athletes tie', () => {
    const { state } = fixedPairs8State(3);
    // The athletes' ranking ties two partners (p3 and p4 share every number), a meaningless draw; the pairs' rules
    // never name them: that pair won everything and is not tied with another pair.
    expect(
      view(state)
        .groups.find((group) => group.length > 1)
        ?.map((row) => row.playerId),
    ).toEqual(['p3', 'p4']);
    expect(nextTieIds(state)).toEqual(pairTieIds(state));
    expect(nextTieIds(state)).not.toContain('p3');
    expect(nextOpenTie(state, view(state))?.spots).toBeLessThanOrEqual(4);
  });

  it('is empty once the pairs were drawn, and for a clean ranking', () => {
    const { state } = fixedPairs8State(3);
    const ids = nextTieIds(state);
    const drawn = withTieDraw(state, ids, [...ids].reverse(), '2026-11-26T10:00:00.000Z');
    // Another tie may follow (the pairs that lost); drawing every one ends it.
    let next = drawn;
    for (let step = 0; step < 4 && nextTieIds(next).length; step++) {
      const more = nextTieIds(next);
      next = withTieDraw(next, more, [...more].reverse(), '2026-11-26T10:00:00.000Z');
    }
    expect(nextTieIds(next)).toEqual([]);
    // A tournament that ranks its pairs cleanly has nothing to draw.
    expect(nextTieIds(fixedPairsState(8, 3).state)).toEqual([]);
  });
});
