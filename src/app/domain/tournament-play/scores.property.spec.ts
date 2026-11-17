import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { type LiveScoreRule, type PodiumRule, withFinalLivePoints, withoutScore, withRoundScore } from './scores';

const podium: PodiumRule = (stage) => stage;
const live: LiveScoreRule = (points) => ({
  scoreA: points.filter((p) => p === 'A').length,
  scoreB: points.filter((p) => p === 'B').length,
  tieBreakA: null,
  tieBreakB: null,
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const base = (): TournamentState =>
  tournamentState({
    players: namedPlayers(8),
    rounds: [
      round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4']), match('m2', ['p5', 'p6'], ['p7', 'p8'])]),
      round(2, [match('m3', ['p1', 'p3'], ['p2', 'p4'])]),
    ],
    finals: {
      matches: [match('f1', ['p1', 'p3'], ['p2', 'p4'], null, null, { phase: 'final', finalKind: 'championship' })],
      complete: false,
      podiumPlayerIds: [],
    },
  });

describe('score edits (properties)', () => {
  it('never edit their input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('m1', 'm2', 'm3'),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.constantFrom<'A' | 'B'>('A', 'B'), { maxLength: 12 }),
        (id, a, b, points) => {
          const state = deepFreeze(base());
          withRoundScore(state, id, a, b);
          withoutScore(state, id, podium);
          withFinalLivePoints(state, 'f1', points, live, podium);
        },
      ),
    );
  });

  it('clearing a score restores the match to unplayed', () => {
    fc.assert(
      fc.property(fc.constantFrom('m1', 'm2', 'm3'), fc.integer({ min: 0, max: 4 }), (id, a) => {
        const state = base();
        const cleared = withoutScore(withRoundScore(state, id, 4, a === 4 ? 3 : a), id, podium);
        const found = cleared.rounds.flatMap((r) => r.matches).find((m) => m.id === id)!;
        expect(found).toMatchObject({ scoreA: null, scoreB: null, tieBreakA: null, tieBreakB: null });
        // The other matches are exactly as they were.
        for (const other of cleared.rounds.flatMap((r) => r.matches).filter((m) => m.id !== id))
          expect(other).toEqual(state.rounds.flatMap((r) => r.matches).find((m) => m.id === other.id));
      }),
    );
  });

  it('point by point: the games always follow the list of points', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom<'A' | 'B'>('A', 'B'), { maxLength: 30 }), (points) => {
        const next = withFinalLivePoints(base(), 'f1', points, live, podium);
        const final = next.finals!.matches[0];
        expect(final.livePoints).toEqual(points);
        expect(final.scoreA).toBe(points.filter((p) => p === 'A').length);
        expect(final.scoreB).toBe(points.filter((p) => p === 'B').length);
      }),
    );
  });
});
