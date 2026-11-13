import type { TournamentState } from '../../core/models';
import { type FinalWinnerSide, isScored } from './scoring';

/** Every match of the tournament, group stage and finals. */
export function totalMatches(state: TournamentState): number {
  return state.rounds.reduce((sum, round) => sum + round.matches.length, 0) + (state.finals?.matches.length ?? 0);
}

/** Scored group matches plus decided finals. */
export function completedMatches(state: TournamentState, winnerSide: FinalWinnerSide): number {
  const roundMatches = state.rounds.reduce(
    (sum, round) => sum + round.matches.filter((match) => isScored(match)).length,
    0,
  );
  const finalMatches = (state.finals?.matches ?? []).filter((match) => winnerSide(match) !== null).length;
  return roundMatches + finalMatches;
}

/** Rounds whose matches are all scored. */
export function completedRounds(state: TournamentState): number {
  return state.rounds.filter((r) => r.matches.every((m) => isScored(m))).length;
}

/** Share of matches done, 0 to 100. */
export function progressPercent(state: TournamentState, winnerSide: FinalWinnerSide): number {
  const total = totalMatches(state);
  return total ? Math.round((completedMatches(state, winnerSide) / total) * 100) : 0;
}

/** Whether the round at this index (0-based) has all its matches scored. */
export function roundDone(state: TournamentState, index: number): boolean {
  return state.rounds[index]?.matches.every((m) => isScored(m)) ?? false;
}

/** `hh:mm:ss`; negative durations show as zero. */
export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

/** Time since the tournament started, frozen once it finished; `—` before it starts. `now` is epoch milliseconds. */
export function elapsedLabel(state: TournamentState, now: number): string {
  if (!state.startedAt) return '—';
  const end = state.finishedAt ? Date.parse(state.finishedAt) : now;
  return formatElapsed(end - Date.parse(state.startedAt));
}
