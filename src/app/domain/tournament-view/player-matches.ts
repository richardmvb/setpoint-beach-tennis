import type { FinalMatchKind, Match, TournamentState } from '../../core/models';
import { shownScore } from './final-score';
import type { FinalWinnerSide } from './scoring';

/** Where a match was played: a group-stage round, or a final of a given kind. */
type PlayerMatchPhase = { kind: 'round'; number: number } | { kind: 'final'; finalKind: FinalMatchKind | undefined };

/** One match seen from one player's side. Scores are null while the match is pending. */
export interface PlayerMatch {
  phase: PlayerMatchPhase;
  partnerId: string;
  opponentIds: string[];
  scoreFor: number | null;
  scoreAgainst: number | null;
  /** The tie-break points of a set that went to a tie-break, from the player's side. */
  tieBreak: { for: number; against: number } | null;
  result: 'win' | 'loss' | null;
}

/** Every match the player is in: group rounds in order, then finals. */
export function playerMatches(state: TournamentState, playerId: string, winnerSide: FinalWinnerSide): PlayerMatch[] {
  if (!playerId) return [];
  const plays = (match: Match): boolean => match.teamA.includes(playerId) || match.teamB.includes(playerId);
  const details: PlayerMatch[] = [];
  state.rounds.forEach((round) =>
    round.matches
      .filter(plays)
      .forEach((match) =>
        details.push(playerMatch(match, playerId, { kind: 'round', number: round.number }, winnerSide)),
      ),
  );
  (state.finals?.matches ?? [])
    .filter(plays)
    .forEach((match) =>
      details.push(playerMatch(match, playerId, { kind: 'final', finalKind: match.finalKind }, winnerSide)),
    );
  return details;
}

/** How many group-stage matches the player is scheduled for. */
export function scheduledGroupMatches(state: TournamentState, playerId: string): number {
  return state.rounds.reduce(
    (total, round) =>
      total + round.matches.filter((match) => match.teamA.includes(playerId) || match.teamB.includes(playerId)).length,
    0,
  );
}

function playerMatch(
  match: Match,
  playerId: string,
  phase: PlayerMatchPhase,
  winnerSide: FinalWinnerSide,
): PlayerMatch {
  const onA = match.teamA.includes(playerId);
  const team = onA ? match.teamA : match.teamB;
  const shown = shownScore(match);
  const scoreFor = onA ? shown.a : shown.b;
  const scoreAgainst = onA ? shown.b : shown.a;
  let result: PlayerMatch['result'];
  if (match.phase === 'final') {
    const winner = winnerSide(match);
    result = winner === null ? null : (winner === 1) === onA ? 'win' : 'loss';
  } else {
    result = scoreFor === null || scoreAgainst === null ? null : scoreFor > scoreAgainst ? 'win' : 'loss';
  }
  const tieBreak =
    shown.tieBreakA !== null && shown.tieBreakB !== null
      ? { for: onA ? shown.tieBreakA : shown.tieBreakB, against: onA ? shown.tieBreakB : shown.tieBreakA }
      : null;
  return {
    phase,
    partnerId: team.find((id) => id !== playerId) ?? '',
    opponentIds: onA ? match.teamB : match.teamA,
    scoreFor,
    scoreAgainst,
    tieBreak,
    result,
  };
}
