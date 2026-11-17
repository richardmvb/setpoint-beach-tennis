import type { FinalStage, Match, Round, TournamentState } from '../../core/models';

/** Recomputes who reaches the next stage and the podium after a final changed (`FinalsService.updatePodium`). */
export type PodiumRule = (stage: FinalStage) => FinalStage;

/** The games and tie-break a point-by-point final amounts to (the padel score engine, a vendor, so it is passed in). */
export type LiveScoreRule = (points: readonly ('A' | 'B')[]) => {
  scoreA: number;
  scoreB: number;
  tieBreakA: number | null;
  tieBreakB: number | null;
};

/** The edits a final accepts: games and the tie-break points, each `null` when the field is empty. */
export interface FinalScoreEdit {
  a: number | null;
  b: number | null;
  tieBreakA: number | null;
  tieBreakB: number | null;
}

/**
 * Every function here returns a new tournament that shares what did not change, and never edits its input: a view
 * that reads the tournament as a signal only refreshes when the object is a new one.
 */

function mapRounds(rounds: Round[], matchId: string, change: (match: Match) => Match): Round[] {
  let touched = false;
  const next = rounds.map((round) => {
    if (!round.matches.some((match) => match.id === matchId)) return round;
    touched = true;
    return { ...round, matches: round.matches.map((match) => (match.id === matchId ? change(match) : match)) };
  });
  return touched ? next : rounds;
}

function mapFinal(
  state: TournamentState,
  matchId: string,
  change: (match: Match) => Match,
  podium: PodiumRule,
): TournamentState {
  const finals = state.finals;
  if (!finals?.matches.some((match) => match.id === matchId)) return state;
  const matches = finals.matches.map((match) => (match.id === matchId ? change(match) : match));
  return { ...state, finals: podium({ ...finals, matches }) };
}

function withoutLivePoints(match: Match): Match {
  const copy = { ...match };
  delete copy.livePoints;
  return copy;
}

/** A group-stage match gets its (already valid) score. */
export function withRoundScore(state: TournamentState, matchId: string, a: number, b: number): TournamentState {
  const rounds = mapRounds(state.rounds, matchId, (match) => ({ ...match, scoreA: a, scoreB: b }));
  return rounds === state.rounds ? state : { ...state, rounds };
}

/** The score of a match is removed (a group-stage match, or a final, whose podium is recomputed). */
export function withoutScore(state: TournamentState, matchId: string, podium: PodiumRule): TournamentState {
  const clear = (match: Match): Match => ({ ...match, scoreA: null, scoreB: null, tieBreakA: null, tieBreakB: null });
  const rounds = mapRounds(state.rounds, matchId, clear);
  const cleared = rounds === state.rounds ? state : { ...state, rounds };
  return mapFinal(cleared, matchId, clear, podium);
}

/**
 * A final's games or tie-break were typed. The tie-break only exists at 6 to 6, so it is dropped otherwise, and the
 * next stage and the podium are recomputed.
 */
export function withFinalScore(
  state: TournamentState,
  matchId: string,
  edit: FinalScoreEdit,
  podium: PodiumRule,
): TournamentState {
  const tieBreak = edit.a === 6 && edit.b === 6;
  return mapFinal(
    state,
    matchId,
    (match) => ({
      ...match,
      scoreA: edit.a,
      scoreB: edit.b,
      tieBreakA: tieBreak ? edit.tieBreakA : null,
      tieBreakB: tieBreak ? edit.tieBreakB : null,
    }),
    podium,
  );
}

/** The championship switches between typing the games and scoring point by point; either way the result is cleared. */
export function withFinalLiveMode(
  state: TournamentState,
  matchId: string,
  on: boolean,
  live: LiveScoreRule,
  podium: PodiumRule,
): TournamentState {
  return mapFinal(
    state,
    matchId,
    (match) => {
      const plain = withoutLivePoints(match);
      return on
        ? { ...plain, livePoints: [], ...live([]) }
        : { ...plain, scoreA: null, scoreB: null, tieBreakA: null, tieBreakB: null };
    },
    podium,
  );
}

/** A point-by-point final has a new list of points: its games and tie-break follow. */
export function withFinalLivePoints(
  state: TournamentState,
  matchId: string,
  points: ('A' | 'B')[],
  live: LiveScoreRule,
  podium: PodiumRule,
): TournamentState {
  return mapFinal(state, matchId, (match) => ({ ...match, livePoints: points, ...live(points) }), podium);
}
