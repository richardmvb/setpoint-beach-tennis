import type { SharedTournamentSnapshot, TournamentState } from '../../core/models';
import { defaultFixedPairs, fixedPairsMode } from './format';

/**
 * The tournament state of a shared snapshot, ready to render: the shared identity is set, fields that older clients
 * did not save get their defaults, and a full fixed-pairs roster without pairs gets the default ones.
 */
export function normalizeSharedState(snapshot: SharedTournamentSnapshot): TournamentState {
  const state: TournamentState = {
    ...snapshot.state,
    hostingMode: 'shared',
    sharedTournamentId: snapshot.id,
    sharedStatus: snapshot.status,
    tournamentMode: snapshot.state.tournamentMode ?? 'super',
    groupFormat: snapshot.state.groupFormat ?? 'rotating',
    groups: snapshot.state.groups ?? [],
    fixedPairs: snapshot.state.fixedPairs ?? [],
    finals: snapshot.state.finals ?? null,
    tieBreakDraws: snapshot.state.tieBreakDraws ?? [],
  };
  if (fixedPairsMode(state) && state.players.length === state.size && state.fixedPairs?.length !== state.size / 2)
    state.fixedPairs = defaultFixedPairs(state);
  return state;
}
