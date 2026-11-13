import type { TournamentState } from './models';

/** The copy of a tournament that is safe to publish: no analytics id and no photos. */
export function publicTournamentState(state: TournamentState): TournamentState {
  return {
    ...state,
    analyticsId: undefined,
    players: state.players.map(({ photoDataUrl: _photoDataUrl, ...player }) => player),
  };
}
