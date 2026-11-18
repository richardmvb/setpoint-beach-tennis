import { describe, expect, it } from 'vitest';
import type { Match } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import {
  completedMatches,
  completedRounds,
  elapsedLabel,
  formatElapsed,
  groupStageComplete,
  listMatches,
  progressPercent,
  roundDone,
  roundMatchesDone,
  totalMatches,
} from './progress';

/** Finals are decided by the score engine in the app; here a final is decided when its id ends in "-won". */
const winnerSide = (final: Match): 1 | 2 | null => (final.id.endsWith('-won') ? 1 : null);

const state = tournamentState({
  players: namedPlayers(4),
  rounds: [
    round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1), match('b', ['p1', 'p3'], ['p2', 'p4'], 4, 2)]),
    round(2, [match('c', ['p1', 'p4'], ['p2', 'p3'], 4, 0), match('d', ['p2', 'p4'], ['p1', 'p3'])]),
  ],
  finals: {
    matches: [match('f1-won', ['p1', 'p2'], ['p3', 'p4']), match('f2', ['p1', 'p3'], ['p2', 'p4'])],
    complete: false,
    podiumPlayerIds: [],
  },
});

describe('tournament progress', () => {
  it('counts every match, the scored ones and the decided finals', () => {
    expect(totalMatches(state)).toBe(6);
    expect(completedMatches(state, winnerSide)).toBe(4);
    expect(progressPercent(state, winnerSide)).toBe(67);
  });

  it('is zero percent when there is nothing to play', () => {
    expect(progressPercent(tournamentState(), winnerSide)).toBe(0);
  });

  it('knows which rounds are done', () => {
    expect(completedRounds(state)).toBe(1);
    expect(roundDone(state, 0)).toBe(true);
    expect(roundDone(state, 1)).toBe(false);
    expect(roundDone(state, 5)).toBe(false);
  });
});

describe('elapsed time', () => {
  it('formats hours, minutes and seconds, never negative', () => {
    expect(formatElapsed(((1 * 60 + 2) * 60 + 3) * 1000 + 999)).toBe('01:02:03');
    expect(formatElapsed(-5000)).toBe('00:00:00');
  });

  it('shows a dash before the start, runs with the clock, and freezes at the finish', () => {
    const now = Date.parse('2026-11-13T10:30:00.000Z');
    expect(elapsedLabel(tournamentState(), now)).toBe('—');
    const started = tournamentState({ startedAt: '2026-11-13T10:00:00.000Z' });
    expect(elapsedLabel(started, now)).toBe('00:30:00');
    expect(elapsedLabel({ ...started, finishedAt: '2026-11-13T10:10:05.000Z' }, now)).toBe('00:10:05');
  });
});

describe('roundMatchesDone', () => {
  it('counts the matches of a round that have a score', () => {
    expect(roundMatchesDone(state, 0)).toBe(2);
    expect(roundMatchesDone(state, 1)).toBe(1);
  });

  it('is zero for a round that does not exist', () => {
    expect(roundMatchesDone(state, 9)).toBe(0);
  });
});

describe('groupStageComplete and listMatches', () => {
  it('the group stage is complete only with a schedule whose matches are all scored', () => {
    expect(groupStageComplete(tournamentState())).toBe(false);
    expect(groupStageComplete(state)).toBe(false);
    const done = {
      ...state,
      rounds: state.rounds.map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, scoreA: 6, scoreB: 3 })) })),
    };
    expect(groupStageComplete(done)).toBe(true);
  });

  it('lists the matches in drawn order with their round, optionally only the pending ones', () => {
    const all = listMatches(state, { pendingOnly: false, groupId: '' });
    expect(all.map((item) => item.roundNumber)).toEqual(state.rounds.flatMap((r) => r.matches.map(() => r.number)));
    const pending = listMatches(state, { pendingOnly: true, groupId: '' });
    expect(pending.length).toBe(all.length - 3);
    expect(listMatches(state, { pendingOnly: false, groupId: 'nobody' })).toEqual([]);
  });
});
