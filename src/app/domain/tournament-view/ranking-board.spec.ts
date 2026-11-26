import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
import { fixedPairs8State, groups20State, groups24State, strongerPairWins } from '../../testing/groups20';
import { storedTournament, tournamentState } from '../../testing/tournament-state';
import { rankingBoard } from './ranking-board';

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

describe('rankingBoard, other formats', () => {
  it('is null for Super, fixed pairs, the smaller group formats and before the schedule exists', () => {
    expect(rankingBoard(storedTournament())).toBeNull();
    expect(rankingBoard(fixedPairs8State().state)).toBeNull();
    expect(rankingBoard({ ...groups24State(), groupFormat: 'fixed' })).toBeNull();
    expect(rankingBoard({ ...groups24State(), size: 12 })).toBeNull();
    expect(rankingBoard({ ...groups24State(), rounds: [] })).toBeNull();
    expect(rankingBoard(tournamentState({ size: 20, tournamentMode: 'groups' }))).toBeNull();
  });
});
