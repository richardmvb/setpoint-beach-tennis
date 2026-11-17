import { describe, expect, it } from 'vitest';
import { match } from '../../testing/tournament-state';
import { finalScoreStatus, isValidRoundScore, roundScoreStatus } from './score-entry';

describe('isValidRoundScore', () => {
  it.each([
    [4, 0, true],
    [2, 4, true],
    [4, 3, true],
    [3, 2, false],
    [4, 4, false],
    [5, 1, false],
    [-1, 4, false],
    [4.5, 2, false],
    [null, 4, false],
    [4, null, false],
  ])('%s to %s with 4 games to win: %s', (a, b, expected) => {
    expect(isValidRoundScore(a, b, 4)).toBe(expected);
  });

  it('follows the games to win of the tournament', () => {
    expect(isValidRoundScore(3, 1, 3)).toBe(true);
    expect(isValidRoundScore(3, 1, 4)).toBe(false);
  });
});

describe('roundScoreStatus', () => {
  const played = match('m', ['p1', 'p2'], ['p3', 'p4'], 4, 2);
  const open = match('m', ['p1', 'p2'], ['p3', 'p4']);

  it('asks for both numbers while one is missing', () => {
    expect(roundScoreStatus({ a: null, b: null }, open, 4)).toBe('fillBoth');
    expect(roundScoreStatus({ a: 4, b: null }, open, 4)).toBe('fillBoth');
  });

  it('flags a score that is not a finished game', () => {
    expect(roundScoreStatus({ a: 3, b: 2 }, open, 4)).toBe('invalid');
  });

  it('says saved when the match holds the typed score', () => {
    expect(roundScoreStatus({ a: 4, b: 2 }, played, 4)).toBe('saved');
  });

  it('says updating when the typed score is valid but not on the match yet', () => {
    expect(roundScoreStatus({ a: 4, b: 1 }, played, 4)).toBe('updating');
  });
});

describe('finalScoreStatus', () => {
  const decided = (m: ReturnType<typeof match>): 1 | 2 | null => (m.scoreA === 6 && (m.scoreB ?? 9) <= 4 ? 1 : null);

  it('reads the state of a final from its games', () => {
    const base = ['p1', 'p2'] as [string, string];
    const other = ['p3', 'p4'] as [string, string];
    expect(finalScoreStatus(match('f', base, other, 6, 2), decided)).toBe('resultSaved');
    expect(finalScoreStatus(match('f', base, other, 6, 6), decided)).toBe('tieBreak');
    expect(finalScoreStatus(match('f', base, other), decided)).toBe('enterGames');
    expect(finalScoreStatus(match('f', base, other, 3, 2), decided)).toBe('inProgress');
  });
});
