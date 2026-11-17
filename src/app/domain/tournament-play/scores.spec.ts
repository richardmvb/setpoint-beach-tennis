import { describe, expect, it } from 'vitest';
import type { FinalStage, Match, TournamentState } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import {
  type LiveScoreRule,
  type PodiumRule,
  withFinalLiveMode,
  withFinalLivePoints,
  withFinalScore,
  withoutScore,
  withRoundScore,
} from './scores';

const podium: PodiumRule = (stage) => ({ ...stage, complete: stage.matches.every((m) => m.scoreA !== null) });
/** One point is one game, so the rule is easy to read in the expectations. */
const live: LiveScoreRule = (points) => ({
  scoreA: points.filter((p) => p === 'A').length,
  scoreB: points.filter((p) => p === 'B').length,
  tieBreakA: null,
  tieBreakB: null,
});

function build(extra: Partial<TournamentState> = {}): TournamentState {
  const finals: FinalStage = {
    matches: [
      match('final-championship', ['p1', 'p3'], ['p2', 'p4'], null, null, {
        phase: 'final',
        finalKind: 'championship',
      }),
      match('final-third-place', ['p5', 'p7'], ['p6', 'p8'], null, null, { phase: 'final', finalKind: 'third-place' }),
    ],
    complete: false,
    podiumPlayerIds: [],
  };
  return tournamentState({
    players: namedPlayers(8),
    rounds: [
      round(1, [match('r1-m1', ['p1', 'p2'], ['p3', 'p4']), match('r1-m2', ['p5', 'p6'], ['p7', 'p8'], 4, 1)]),
      round(2, [match('r2-m1', ['p1', 'p3'], ['p2', 'p4'])]),
    ],
    finals,
    ...extra,
  });
}

const roundMatch = (state: TournamentState, id: string): Match =>
  state.rounds.flatMap((r) => r.matches).find((m) => m.id === id)!;
const finalMatch = (state: TournamentState, id: string): Match => state.finals!.matches.find((m) => m.id === id)!;

describe('withRoundScore', () => {
  it('returns a new tournament with the score on that match only', () => {
    const state = build();
    const next = withRoundScore(state, 'r1-m1', 4, 2);
    expect(next).not.toBe(state);
    expect(roundMatch(next, 'r1-m1')).toMatchObject({ scoreA: 4, scoreB: 2 });
    expect(roundMatch(next, 'r1-m2')).toMatchObject({ scoreA: 4, scoreB: 1 });
  });

  it('never edits its input and shares what did not change', () => {
    const state = build();
    const next = withRoundScore(state, 'r1-m1', 4, 2);
    expect(roundMatch(state, 'r1-m1').scoreA).toBeNull();
    expect(next.rounds[1]).toBe(state.rounds[1]);
    expect(next.players).toBe(state.players);
    expect(next.finals).toBe(state.finals);
  });

  it('returns the same object for a match that is not in the schedule', () => {
    const state = build();
    expect(withRoundScore(state, 'nope', 4, 2)).toBe(state);
  });
});

describe('withoutScore', () => {
  it('clears the score and tie-break of a group-stage match', () => {
    const next = withoutScore(build(), 'r1-m2', podium);
    expect(roundMatch(next, 'r1-m2')).toMatchObject({ scoreA: null, scoreB: null, tieBreakA: null, tieBreakB: null });
  });

  it('clears a final and recomputes the podium', () => {
    const scored = withFinalScore(
      build(),
      'final-championship',
      { a: 6, b: 2, tieBreakA: null, tieBreakB: null },
      podium,
    );
    const next = withoutScore(scored, 'final-championship', (stage) => ({ ...stage, podiumPlayerIds: ['recomputed'] }));
    expect(finalMatch(next, 'final-championship').scoreA).toBeNull();
    expect(next.finals?.podiumPlayerIds).toEqual(['recomputed']);
  });
});

describe('withFinalScore', () => {
  it('writes the games and runs the podium rule', () => {
    const next = withFinalScore(
      build(),
      'final-championship',
      { a: 6, b: 3, tieBreakA: null, tieBreakB: null },
      podium,
    );
    expect(finalMatch(next, 'final-championship')).toMatchObject({ scoreA: 6, scoreB: 3 });
    expect(next.finals?.complete).toBe(false);
  });

  it('keeps the tie-break only at 6 to 6', () => {
    const tied = withFinalScore(build(), 'final-championship', { a: 6, b: 6, tieBreakA: 7, tieBreakB: 5 }, podium);
    expect(finalMatch(tied, 'final-championship')).toMatchObject({ tieBreakA: 7, tieBreakB: 5 });
    const moved = withFinalScore(tied, 'final-championship', { a: 6, b: 4, tieBreakA: 7, tieBreakB: 5 }, podium);
    expect(finalMatch(moved, 'final-championship')).toMatchObject({ tieBreakA: null, tieBreakB: null });
  });

  it('returns the same object when there are no finals', () => {
    const state = build({ finals: null });
    expect(withFinalScore(state, 'final-championship', { a: 6, b: 1, tieBreakA: null, tieBreakB: null }, podium)).toBe(
      state,
    );
  });
});

describe('point-by-point finals', () => {
  it('turns on with an empty list and the engine score of nothing played', () => {
    const next = withFinalLiveMode(build(), 'final-championship', true, live, podium);
    expect(finalMatch(next, 'final-championship')).toMatchObject({ livePoints: [], scoreA: 0, scoreB: 0 });
  });

  it('follows the points', () => {
    const on = withFinalLiveMode(build(), 'final-championship', true, live, podium);
    const next = withFinalLivePoints(on, 'final-championship', ['A', 'A', 'B'], live, podium);
    expect(finalMatch(next, 'final-championship')).toMatchObject({ livePoints: ['A', 'A', 'B'], scoreA: 2, scoreB: 1 });
    expect(finalMatch(on, 'final-championship').livePoints).toEqual([]);
  });

  it('turns off by dropping the key and clearing the result', () => {
    const on = withFinalLiveMode(build(), 'final-championship', true, live, podium);
    const scored = withFinalLivePoints(on, 'final-championship', ['A'], live, podium);
    const off = withFinalLiveMode(scored, 'final-championship', false, live, podium);
    expect('livePoints' in finalMatch(off, 'final-championship')).toBe(false);
    expect(finalMatch(off, 'final-championship')).toMatchObject({ scoreA: null, scoreB: null });
  });
});
