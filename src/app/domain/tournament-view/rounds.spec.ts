import { describe, expect, it } from 'vitest';
import { match, round, tournamentState } from '../../testing/tournament-state';
import { historyRounds, spotlightRound, viewerRounds } from './rounds';

const played = round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1)]);
const half = round(2, [match('b', ['p1', 'p3'], ['p2', 'p4'], 4, 2), match('c', ['p1', 'p4'], ['p2', 'p3'])]);
const pending = round(3, [match('d', ['p2', 'p4'], ['p1', 'p3'])]);

describe('viewer rounds', () => {
  it('shows every round while the tournament runs', () => {
    const state = tournamentState({ rounds: [played, half, pending], earlyFinalsEnabled: true });
    expect(viewerRounds(state)).toBe(state.rounds);
  });

  it('hides unplayed matches and empty rounds after early finals ended the group stage', () => {
    const state = tournamentState({
      rounds: [played, half, pending],
      earlyFinalsEnabled: true,
      finishedAt: '2026-11-13T12:00:00.000Z',
    });
    expect(viewerRounds(state).map((r) => [r.number, r.matches.map((m) => m.id)])).toEqual([
      [1, ['a']],
      [2, ['b']],
    ]);
  });

  it('keeps every round of a finished tournament without early finals', () => {
    const state = tournamentState({ rounds: [played, half, pending], finishedAt: '2026-11-13T12:00:00.000Z' });
    expect(viewerRounds(state)).toHaveLength(3);
  });

  it('puts the first round with a pending match on court, and the others in the history', () => {
    const rounds = [played, half, pending];
    const spotlight = spotlightRound(rounds);
    expect(spotlight?.number).toBe(2);
    expect(historyRounds(rounds, spotlight).map((r) => r.number)).toEqual([1, 3]);
  });

  it('has nothing on court once every round is played', () => {
    expect(spotlightRound([played])).toBeNull();
    expect(historyRounds([played], null)).toEqual([played]);
  });
});
