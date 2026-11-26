import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
import {
  fixedPairs8State,
  fixedPairsState,
  groups12State,
  groups20State,
  groups24State,
  groups8State,
  identicalGroups,
  mixedGroups24State,
  settleAllTies,
  strongerPairWins,
} from '../../testing/groups20';
import { storedTournament, tournamentState } from '../../testing/tournament-state';
import { withTieDraw } from '../tournament-play/tie-draw';
import { boardViewer, rankingBoard } from './ranking-board';

const finalsStage = { matches: [], complete: false, podiumPlayerIds: [] };

describe('rankingBoard, 20 players', () => {
  const played = groups20State(4, 3, strongerPairWins);

  it('lists the 5 groups in their own order and the 20 athletes in the order of the race to the finals', () => {
    const board = rankingBoard(played)!;
    expect(board).toMatchObject({ kind: 'qualification', slots: 12, settled: true, provisional: false, folded: false });
    expect(board.groups.map((group) => group.name)).toHaveLength(5);
    for (const group of board.groups) {
      expect(group.entries.map((entry) => entry.groupPlace)).toEqual([1, 2, 3, 4]);
      expect(group.entries.every((entry) => entry.group === group.name.split(' ').pop())).toBe(true);
    }
    expect(board.list.map((entry) => entry.place)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(new Set(board.list.map((entry) => entry.playerId)).size).toBe(20);
    expect(board.leaderName).toBe(board.list[0].name);
  });

  it('marks the qualifiers once the group stage is over: 10 direct, 2 best thirds, 8 out', () => {
    const statuses = rankingBoard(played)!.list.map((entry) => entry.status);
    expect(statuses.filter((status) => status === 'direct')).toHaveLength(10);
    expect(statuses.filter((status) => status === 'bestThird')).toHaveLength(2);
    expect(statuses.filter((status) => status === 'out')).toHaveLength(8);
    // The marks follow the list: the 12 places before the cut are the 12 that go on.
    expect(
      rankingBoard(played)!
        .list.slice(0, 12)
        .every((entry) => entry.status !== 'out'),
    ).toBe(true);
  });

  it('shows no marks and says provisional while a group match has no score', () => {
    const open = groups20State(4, 3);
    const board = rankingBoard(open)!;
    expect(board).toMatchObject({ settled: false, provisional: true, folded: false });
    expect(board.list.every((entry) => entry.status === null)).toBe(true);
    expect(board.list).toHaveLength(20);
  });

  it('folds under the finals when they exist and the group stage is over, not when a score was cleared', () => {
    expect(rankingBoard({ ...played, finals: finalsStage })).toMatchObject({ folded: true, provisional: false });
    const cleared: TournamentState = structuredClone({ ...played, finals: finalsStage });
    cleared.rounds[0].matches[0].scoreA = null;
    cleared.rounds[0].matches[0].scoreB = null;
    expect(rankingBoard(cleared)).toMatchObject({ settled: false, folded: false, provisional: false });
  });

  it('counts the matches each athlete played and is scheduled for', () => {
    const entry = rankingBoard(played)!.list[0];
    expect(entry).toMatchObject({ matchesPlayed: 3, scheduled: 3 });
    expect(rankingBoard(groups20State(5, 3, strongerPairWins))!.list[0]).toMatchObject({ scheduled: 4 });
  });
});

describe('rankingBoard, 24 players', () => {
  const played = groups24State(2, strongerPairWins);

  it('lists the 6 groups ordered by the overall place, with the top 8 reaching the finals and no group marks', () => {
    const board = rankingBoard(played)!;
    expect(board).toMatchObject({ kind: 'overall', slots: 8, settled: true });
    expect(board.groups).toHaveLength(6);
    expect(board.list).toHaveLength(24);
    for (const group of board.groups) {
      expect(group.entries).toHaveLength(4);
      const places = group.entries.map((entry) => entry.place);
      expect(places).toEqual([...places].sort((a, b) => a - b));
      expect(group.entries.every((entry) => entry.groupPlace === null && entry.status === null)).toBe(true);
    }
    expect(board.list.map((entry) => entry.place)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it('is provisional until every match has a score', () => {
    expect(rankingBoard(groups24State(2))).toMatchObject({ settled: false, provisional: true });
  });
});

describe('rankingBoard, every group format', () => {
  it('is null for Super and before the schedule exists', () => {
    expect(rankingBoard(storedTournament())).toBeNull();
    expect(rankingBoard({ ...groups24State(), rounds: [] })).toBeNull();
    expect(rankingBoard(tournamentState({ size: 20, tournamentMode: 'groups' }))).toBeNull();
  });

  it('12 players: 3 groups of 4 and the cut after the 8th place', () => {
    const board = rankingBoard(groups12State(2, strongerPairWins))!;
    expect(board).toMatchObject({ kind: 'overall', slots: 8, settled: true });
    expect(board.groups).toHaveLength(3);
    expect(board.list).toHaveLength(12);
    expect(board.individual).toBeNull();
  });

  it('8 players: everybody goes to the finals, so there is no cut to draw', () => {
    const board = rankingBoard(groups8State(2, strongerPairWins))!;
    expect(board).toMatchObject({ kind: 'overall', slots: 8, cutTies: [] });
    expect(board.list).toHaveLength(8);
    expect(board.groups).toHaveLength(2);
    expect(board.list.every((entry) => entry.place <= board.slots)).toBe(true);
  });

  it('mixed doubles: every athlete carries a gender, and each group has two men and two women', () => {
    const board = rankingBoard(mixedGroups24State(2, strongerPairWins))!;
    expect(board).toMatchObject({ kind: 'overall', slots: 8, matchesTotal: 12 });
    expect(board.list.filter((entry) => entry.gender === 'male')).toHaveLength(12);
    expect(board.list.filter((entry) => entry.gender === 'female')).toHaveLength(12);
    for (const group of board.groups) {
      expect(group.entries.filter((entry) => entry.gender === 'male')).toHaveLength(2);
      expect(group.entries.filter((entry) => entry.gender === 'female')).toHaveLength(2);
    }
  });

  it('fixed pairs: the group lists pairs, the list is of athletes, and the pair takes the better partner place', () => {
    const { state, pairs } = fixedPairsState(12, 3);
    const board = rankingBoard(state)!;
    expect(board).toMatchObject({ kind: 'overall', slots: 8 });
    expect(board.groups).toHaveLength(1);
    expect(board.list).toHaveLength(12);
    const rows = board.groups[0].entries;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.playerIds).toHaveLength(2);
      expect(row.playerId).toBe(row.playerIds[0]);
      expect(row.gender).toBeNull();
      const partners = row.playerIds.map((id) => board.list.find((entry) => entry.playerId === id)!);
      expect(row.name).toBe(partners.map((entry) => entry.name).join(' + '));
      expect(row.place).toBe(Math.min(...partners.map((entry) => entry.place)));
      expect(partners[1].setsWon).toBe(partners[0].setsWon);
    }
    expect(rows.map((row) => row.place)).toEqual([...rows.map((row) => row.place)].sort((a, b) => a - b));
    expect(new Set(rows.flatMap((row) => row.playerIds))).toEqual(new Set(pairs.flat()));
  });

  it('fixed pairs of 8: every athlete is inside, and a partner can look up their own line', () => {
    const board = rankingBoard(fixedPairs8State().state)!;
    expect(board.groups[0].entries).toHaveLength(4);
    expect(boardViewer(board, 'p2')).toMatchObject({ inside: true, how: null });
  });
});

describe('rankingBoard, progress and places', () => {
  it('counts the group matches with a score, and the places by kind', () => {
    const open = groups20State(5, 3, strongerPairWins);
    open.rounds[0].matches[0].scoreA = null;
    open.rounds[0].matches[0].scoreB = null;
    const board = rankingBoard(open)!;
    expect(board.matchesTotal).toBe(20);
    expect(board.matchesDone).toBe(19);
    // 4 groups of 5: the top two of each (8) and all four third places.
    expect(board).toMatchObject({ directSlots: 8, thirdSlots: 4, slots: 12 });
    expect(rankingBoard(groups20State(4, 3, strongerPairWins))).toMatchObject({ directSlots: 10, thirdSlots: 2 });
    expect(rankingBoard(groups24State(2, strongerPairWins))).toMatchObject({
      directSlots: 0,
      thirdSlots: 0,
      slots: 8,
      matchesTotal: 18,
      matchesDone: 18,
    });
  });

  it('lists everybody by the plain standings in the 20-player format, and has no second list for 24', () => {
    const board = rankingBoard(groups20State(4, 3, strongerPairWins))!;
    const individual = board.individual!;
    expect(individual).toHaveLength(20);
    expect(individual.map((entry) => entry.place)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(new Set(individual.map((entry) => entry.playerId))).toEqual(new Set(board.list.map((e) => e.playerId)));
    for (let index = 1; index < individual.length; index++)
      expect(individual[index - 1].setsWon).toBeGreaterThanOrEqual(individual[index].setsWon);
    expect(rankingBoard(groups24State(2, strongerPairWins))!.individual).toBeNull();
  });
});

describe('boardViewer', () => {
  const board = rankingBoard(groups20State(4, 3, strongerPairWins))!;

  it('says how a 20-player athlete goes on today: direct, best third or out', () => {
    const direct = board.list.find((entry) => entry.status === 'direct')!;
    const third = board.list.find((entry) => entry.status === 'bestThird')!;
    const out = board.list.find((entry) => entry.status === 'out')!;
    expect(boardViewer(board, direct.playerId)).toMatchObject({ inside: true, how: 'direct', matchesLeft: 0 });
    expect(boardViewer(board, third.playerId)).toMatchObject({ inside: true, how: 'bestThird' });
    expect(boardViewer(board, out.playerId)).toMatchObject({ inside: false, how: 'out' });
  });

  it('counts the matches left, and has no "how" for 24 players', () => {
    const open = groups20State(4, 3);
    const early = rankingBoard(open)!;
    expect(boardViewer(early, early.list[0].playerId)).toMatchObject({ matchesLeft: 3 });
    const board24 = rankingBoard(groups24State(2, strongerPairWins))!;
    expect(boardViewer(board24, board24.list[0].playerId)).toMatchObject({ inside: true, how: null });
    expect(boardViewer(board24, board24.list[8].playerId)).toMatchObject({ inside: false, how: null });
  });

  it('is null for somebody who is not in the board', () => {
    expect(boardViewer(board, 'nobody')).toBeNull();
    expect(boardViewer(board, '')).toBeNull();
  });
});

describe('rankingBoard, ties across the cut', () => {
  it('24 players: marks the athletes tied across the 8th place, who the draw will decide', () => {
    const board = rankingBoard(groups24State(2, strongerPairWins))!;
    const tied = board.list.filter((entry) => entry.tied);
    // Nine athletes are tied for the last five places: the order shown is only the names.
    expect(board.cutTies).toEqual([{ count: 9, spots: 5 }]);
    expect(tied).toHaveLength(9);
    const places = tied.map((entry) => entry.place);
    expect(Math.min(...places)).toBeLessThanOrEqual(board.slots);
    expect(Math.max(...places)).toBeGreaterThan(board.slots);
    expect(board.list.filter((entry) => !entry.tied && entry.place <= board.slots).length).toBe(3);
  });

  it('20 players: the third places tied across the cut compete for the best-third places', () => {
    const board = rankingBoard(identicalGroups())!;
    expect(board.cutTies).toEqual([{ count: 5, spots: 2 }]);
    expect(board.list.filter((entry) => entry.tied)).toHaveLength(5);
  });

  it('forgets the tie once it was drawn', () => {
    const state = groups24State(2, strongerPairWins);
    const ids = rankingBoard(state)!
      .list.filter((entry) => entry.tied)
      .map((entry) => entry.playerId);
    const drawn = withTieDraw(state, ids, ids, '2026-11-26T10:00:00.000Z');
    const board = rankingBoard(drawn)!;
    expect(board.cutTies).toEqual([]);
    expect(board.list.some((entry) => entry.tied)).toBe(false);
    expect(rankingBoard(settleAllTies(identicalGroups()))!.cutTies).toEqual([]);
  });

  it('says nothing while the group stage is open: everybody is tied then and the order still moves', () => {
    const open = groups24State(2, strongerPairWins);
    open.rounds[0].matches[0].scoreA = null;
    open.rounds[0].matches[0].scoreB = null;
    const board = rankingBoard(open)!;
    expect(board.cutTies).toEqual([]);
    expect(board.list.some((entry) => entry.tied)).toBe(false);
    expect(rankingBoard(groups24State(2))!.cutTies).toEqual([]);
  });

  it('does not mark the individual ranking, which has no cut', () => {
    const board = rankingBoard(identicalGroups())!;
    expect(board.individual!.some((entry) => entry.tied)).toBe(false);
  });
});
