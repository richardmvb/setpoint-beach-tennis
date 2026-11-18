import { describe, expect, it } from 'vitest';
import type { PlayerStanding } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { groups20State, sideAWins } from '../../testing/groups20';
import { createStandingsMemo } from '../tournament-view/standings';
import { shuffledOrder, tiedPositions, unresolvedFinalTie, unresolvedTie, withTieDraw } from './tie-draw';

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
