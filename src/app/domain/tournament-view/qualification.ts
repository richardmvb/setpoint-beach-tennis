import type { TournamentState } from '../../core/models';
import { isGroupTournament } from './format';
import { completedRounds } from './progress';

/**
 * The qualification projection exists for this tournament: the moderator turned it on, it is a shared Super
 * tournament, and the finals have not started. It may still be locked (see `qualificationEnabled`).
 */
export function qualificationSupported(state: TournamentState): boolean {
  return !!state.qualificationStats && state.hostingMode === 'shared' && !isGroupTournament(state) && !state.finals;
}

/** The projection can be computed: it is supported and at least one round is complete. */
export function qualificationEnabled(state: TournamentState): boolean {
  return qualificationSupported(state) && completedRounds(state) >= 1;
}
