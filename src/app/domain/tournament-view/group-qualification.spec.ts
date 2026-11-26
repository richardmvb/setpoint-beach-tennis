import { describe, expect, it } from 'vitest';
import { groups20State, identicalGroups, settleAllTies, sideAWins, strongerPairWins } from '../../testing/groups20';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import { withTieDraw } from '../tournament-play/tie-draw';
import { describeQualificationTie, groupQualification, unresolvedQualificationTie } from './group-qualification';
import { compareStandingCriteria } from './standings';

describe('groupQualification', () => {
  it('5 groups of 4: 10 direct places plus the 2 best thirds', () => {
    const q = groupQualification(groups20State(4, 3, strongerPairWins));
    const statuses = q.byGroup.flatMap((group) => group.rows.map((row) => row.status));
    expect(q.byGroup).toHaveLength(5);
    expect(statuses.filter((s) => s === 'direct')).toHaveLength(10);
    expect(statuses.filter((s) => s === 'bestThird')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'out')).toHaveLength(8);
    expect(new Set(q.seeding).size).toBe(12);
    const bestThirds = q.thirdsRanked.slice(0, 2).map((row) => row.playerId);
    expect(bestThirds.every((id) => q.seeding.includes(id))).toBe(true);
  });

  it('4 groups of 5: 8 direct places plus all 4 thirds', () => {
    const q = groupQualification(groups20State(5, 3, strongerPairWins));
    const statuses = q.byGroup.flatMap((group) => group.rows.map((row) => row.status));
    expect(q.byGroup).toHaveLength(4);
    expect(statuses.filter((s) => s === 'direct')).toHaveLength(8);
    expect(statuses.filter((s) => s === 'bestThird')).toHaveLength(4);
    expect(statuses.filter((s) => s === 'out')).toHaveLength(8);
    expect(new Set(q.seeding).size).toBe(12);
  });

  it('seeds the 12 in one ranking, keeping each group in its own order', () => {
    for (const size of [4, 5] as const) {
      const q = groupQualification(groups20State(size, 11, strongerPairWins));
      for (let index = 1; index < q.qualifiers.length; index++) {
        expect(compareStandingCriteria(q.qualifiers[index - 1], q.qualifiers[index])).toBeLessThanOrEqual(0);
      }
      for (const group of q.byGroup) {
        const seeds = group.rows
          .filter((row) => row.status !== 'out')
          .map((row) => q.seeding.indexOf(row.standing.playerId));
        expect(seeds).toEqual([...seeds].sort((x, y) => x - y));
      }
    }
  });

  it('has no qualifiers before groups exist', () => {
    const q = groupQualification(tournamentState({ size: 20, tournamentMode: 'groups', players: namedPlayers(20) }));
    expect(q.seeding).toEqual([]);
    expect(unresolvedQualificationTie(tournamentState())).toEqual([]);
  });
});

describe('unresolvedQualificationTie', () => {
  it('asks first about the third places tied across the cut, then about the seeding, and ends settled', () => {
    let state = identicalGroups();
    const asked: number[] = [];
    for (let step = 0; step < 10; step++) {
      const tied = unresolvedQualificationTie(state);
      if (!tied.length) break;
      asked.push(tied.length);
      const ids = tied.map((row) => row.playerId);
      state = withTieDraw(state, ids, [...ids].reverse(), '2026-11-18T10:00:00.000Z');
    }
    // 5 tied thirds straddle the cut; then the five 1st places, the five 2nd places and the 2 thirds that got in.
    expect(asked).toEqual([5, 5, 5, 2]);
    const q = groupQualification(state);
    expect(q.seeding).toHaveLength(12);
    // Every group's 1st place (p1, p5, ...) is seeded before any 2nd place.
    const firsts = [1, 5, 9, 13, 17].map((n) => `p${n}`);
    expect(q.seeding.slice(0, 5).sort()).toEqual([...firsts].sort());
  });

  it('keeps a group tie that decides the 2nd or 3rd place as a question, and ignores one after the 3rd place', () => {
    // Everybody loses nothing: every match 6-4 to side A, so groups are full of ties.
    const state = groups20State(4, 5, sideAWins);
    expect(unresolvedQualificationTie(state).length).toBeGreaterThan(1);
  });

  it('settles with recorded draws and always yields 12 distinct qualifiers', () => {
    for (const size of [4, 5] as const) {
      const state = settleAllTies(groups20State(size, 9, sideAWins));
      expect(unresolvedQualificationTie(state)).toEqual([]);
      const q = groupQualification(state);
      expect(new Set(q.seeding).size).toBe(12);
      // The recorded draw is stable: asking again gives the same order.
      expect(groupQualification(state).seeding).toEqual(q.seeding);
    }
  });

  it('says where a tie sits: in a group, among the thirds, or in the order of the qualifiers', () => {
    const grouped = identicalGroups();
    const thirds = unresolvedQualificationTie(grouped);
    expect(describeQualificationTie(grouped, thirds)).toEqual({ kind: 'thirds' });

    const state = groups20State(4, 5, sideAWins);
    const tied = unresolvedQualificationTie(state);
    const kind = describeQualificationTie(state, tied);
    expect(['group', 'thirds', 'seeding']).toContain(kind.kind);
    if (kind.kind === 'group') {
      expect(kind.groupName).toMatch(/^Grupo /);
      expect(kind.positions).toHaveLength(tied.length);
    }
  });
});
