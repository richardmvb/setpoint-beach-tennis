import { describe, expect, it } from 'vitest';
import type { Match } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import {
  completedMatches,
  completedRounds,
  elapsedLabel,
  formatElapsed,
  progressPercent,
  roundDone,
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
