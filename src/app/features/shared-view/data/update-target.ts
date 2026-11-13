import type { TournamentState } from '../../../core/models';

/** The sections of the page an update can point at (their element ids). */
export type UpdateTarget = 'guest-finals' | 'guest-ranking' | 'guest-participants' | 'guest-rounds';

/** Where the "new updates" button scrolls to: the part of the page that changed between two states. */
export function updateTarget(previous: TournamentState, next: TournamentState): UpdateTarget {
  if (JSON.stringify(previous.finals) !== JSON.stringify(next.finals) || (!previous.finishedAt && next.finishedAt))
    return 'guest-finals';
  if (JSON.stringify(previous.players) !== JSON.stringify(next.players))
    return next.rounds.length ? 'guest-ranking' : 'guest-participants';
  if (JSON.stringify(previous.rounds) !== JSON.stringify(next.rounds)) return 'guest-rounds';
  return next.rounds.length ? 'guest-ranking' : 'guest-participants';
}
