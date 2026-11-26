import { describe, expect, it } from 'vitest';
import type { PlayerStanding } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { fixedPairs8State, fixedPairsState, groups20State, sideAWins } from '../../testing/groups20';
import { createStandingsMemo } from '../tournament-view/standings';
import {
  shuffledOrder,
  tiedPositions,
  unresolvedFinalTie,
  unresolvedPairTie,
  unresolvedTie,
  withTieDraw,
} from './tie-draw';

/** Everybody ties: every match ends 4 to 4, so nothing separates the players. */
function allTied() {
  return tournamentState({
    players: namedPlayers(8),
    rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 4), match('m2', ['p5', 'p6'], ['p7', 'p8'], 4, 4)])],
  });
}

describe('unresolvedFinalTie', () => {
  it('finds the players the rules could not separate', () => {
    const state = allTied();
    const view = createStandingsMemo()(state);
    expect(unresolvedFinalTie(state, view)).toHaveLength(8);
  });

  it('is empty once the draw is recorded', () => {
    const state = allTied();
    const ids = state.players.map((p) => p.id);
    const drawn = withTieDraw(state, ids, [...ids].reverse(), '2026-11-17T10:00:00.000Z');
    expect(unresolvedFinalTie(drawn, createStandingsMemo()(drawn))).toEqual([]);
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
    const view = createStandingsMemo()(state);
    // Players 9 and 10 never played: they tie with each other at the bottom, outside the finalists.
    const bottom = view.groups.find((group) => group.some((row) => row.playerId === 'p9'));
    expect(bottom?.length).toBeGreaterThan(1);
    expect(unresolvedFinalTie(state, view).some((row) => row.playerId === 'p9')).toBe(false);
  });
});

describe('tiedPositions', () => {
  it('lists the places of the players, in order', () => {
    const rows = ['p1', 'p2', 'p3', 'p4', 'p5'].map((playerId) => ({ playerId }) as PlayerStanding);
    expect(tiedPositions(['p5', 'p4'], rows)).toEqual([4, 5]);
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

describe('unresolvedTie', () => {
  it('asks the finals question for the usual formats and the qualification question for the 20-player one', () => {
    const view = createStandingsMemo();
    const usual = allTied();
    expect(unresolvedTie(usual, view(usual))).toEqual(unresolvedFinalTie(usual, view(usual)));
    const twenty = groups20State(4, 5, sideAWins);
    expect(unresolvedTie(twenty, view(twenty)).length).toBeGreaterThan(1);
  });
});

describe('unresolvedPairTie, fixed pairs', () => {
  it('asks about tied pairs, never about partners: partners share every number and are one competitor', () => {
    // Every match ends 6-3 to side A: the pairs that won tie with each other, the pairs that lost with each other.
    const { state } = fixedPairs8State(3);
    const tied = unresolvedPairTie(state);
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
    const view = createStandingsMemo()(state);
    expect(unresolvedTie(state, view).map((row) => row.playerId)).toEqual(
      unresolvedPairTie(state).map((row) => row.playerId),
    );
    // The athletes' rules would ask for a draw between two partners (p3 and p4 share every number), which is
    // meaningless; the pairs' rules never name them: that pair won everything and is not tied with another pair.
    expect(unresolvedFinalTie(state, view).map((row) => row.playerId)).toEqual(['p3', 'p4']);
    expect(unresolvedPairTie(state).map((row) => row.playerId)).not.toContain('p3');
  });

  it('is empty once the pairs were drawn, and for a clean ranking', () => {
    const { state } = fixedPairs8State(3);
    const ids = unresolvedPairTie(state).map((row) => row.playerId);
    const drawn = withTieDraw(state, ids, [...ids].reverse(), '2026-11-26T10:00:00.000Z');
    // Another tie may follow (the pairs that lost); drawing every one ends it.
    let next = drawn;
    for (let step = 0; step < 4 && unresolvedPairTie(next).length; step++) {
      const more = unresolvedPairTie(next).map((row) => row.playerId);
      next = withTieDraw(next, more, [...more].reverse(), '2026-11-26T10:00:00.000Z');
    }
    expect(unresolvedPairTie(next)).toEqual([]);
    // A tournament that ranks its pairs cleanly has nothing to draw.
    expect(unresolvedPairTie(fixedPairsState(8, 3).state)).toEqual([]);
  });

  it('is empty for tournaments without fixed pairs', () => {
    expect(unresolvedPairTie(groups20State(4, 3, sideAWins))).toEqual([]);
  });
});
