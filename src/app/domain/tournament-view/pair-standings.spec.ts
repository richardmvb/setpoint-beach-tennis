import { describe, expect, it } from 'vitest';
import type { Match } from '../../core/models';
import { fixedPairs8State, fixedPairsState, groups24State } from '../../testing/groups20';
import { withTieDraw } from '../tournament-play/tie-draw';
import { fixedPairsOf, rankedPairGroups } from './pair-standings';

/** The schedule of 4 pairs: R1 P1xP3 and P2xP4, R2 P2xP1 and P3xP4, R3 P4xP1 and P2xP3 (P1 Ana+Bia ... P4 Gui+Hana). */
const R1A = 'group-group-1-r1-c1';
const R1B = 'group-group-1-r1-c2';
const R2A = 'group-group-1-r2-c1';
const R2B = 'group-group-1-r2-c2';
const R3A = 'group-group-1-r3-c1';
const R3B = 'group-group-1-r3-c2';
const scoreById =
  (scores: Record<string, [number, number]>) =>
  (match: Match): [number, number] =>
    scores[match.id];

/** Ana+Bia win all three; Caio+Duda two; Edu+Fabi one; Gui+Hana none. */
const clean = scoreById({
  [R1A]: [6, 2],
  [R1B]: [6, 4],
  [R2A]: [3, 6],
  [R2B]: [6, 3],
  [R3A]: [2, 6],
  [R3B]: [6, 4],
});

/** P1 wins everything 6-4; P2, P3 and P4 beat each other in a circle: P2 > P4 > P3 > P2, every number equal. */
const circle = scoreById({
  [R1A]: [6, 4], // P1 beats P3
  [R1B]: [6, 4], // P2 beats P4
  [R2A]: [4, 6], // P1 beats P2 (P2 is team A)
  [R2B]: [4, 6], // P4 beats P3 (P3 is team A)
  [R3A]: [4, 6], // P1 beats P4 (P4 is team A)
  [R3B]: [4, 6], // P3 beats P2 (P2 is team A)
});

describe('rankedPairGroups', () => {
  it('ranks the pairs, each as one competitor named after both partners', () => {
    const { state } = fixedPairsState(8, 3, clean);
    const groups = rankedPairGroups(state);
    expect(groups.map((group) => group.map((pair) => pair.name))).toEqual([
      ['Ana + Bia'],
      ['Caio + Duda'],
      ['Edu + Fabi'],
      ['Gui + Hana'],
    ]);
    const [first] = groups[0];
    expect(first).toMatchObject({ pairId: 'p1', playerIds: ['p1', 'p2'] });
    // Partners share every number, and the pair carries them under its own name.
    expect(first.standing).toMatchObject({ playerId: 'p1', name: 'Ana + Bia', setsWon: 3, gameBalance: 11 });
    expect(groups.map((group) => group[0].standing.setsWon)).toEqual([3, 2, 1, 0]);
  });

  it('keeps pairs that tie on everything together, in name order, until a draw is recorded', () => {
    const { state } = fixedPairsState(8, 3, circle);
    const groups = rankedPairGroups(state);
    expect(groups.map((group) => group.map((pair) => pair.name))).toEqual([
      ['Ana + Bia'],
      ['Caio + Duda', 'Edu + Fabi', 'Gui + Hana'],
    ]);
  });

  it('orders a tied set by the recorded draw, which is stored with the first partner of each pair', () => {
    const { state } = fixedPairsState(8, 3, circle);
    const drawn = withTieDraw(state, ['p3', 'p5', 'p7'], ['p7', 'p3', 'p5'], '2026-11-26T10:00:00.000Z');
    expect(rankedPairGroups(drawn).flatMap((group) => group.map((pair) => pair.name))).toEqual([
      'Ana + Bia',
      'Gui + Hana',
      'Caio + Duda',
      'Edu + Fabi',
    ]);
  });

  it('has no pairs unless the tournament has fixed pairs', () => {
    expect(rankedPairGroups(groups24State(2))).toEqual([]);
  });
});

describe('fixedPairsOf', () => {
  it('reads the pairs from the groups, and from the setup when the groups have none', () => {
    const { state, pairs } = fixedPairs8State();
    expect(fixedPairsOf(state)).toEqual(pairs);
    const withoutGroupPairs = { ...state, groups: state.groups?.map((group) => ({ ...group, fixedPairs: undefined })) };
    expect(fixedPairsOf(withoutGroupPairs)).toEqual(pairs);
  });
});
