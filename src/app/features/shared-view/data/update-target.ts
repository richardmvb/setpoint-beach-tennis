import type { TournamentState } from '../../../core/models';

/** The sections of the page an update can point at (their element ids). */
export type UpdateTarget = 'guest-finals' | 'guest-ranking' | 'guest-participants' | 'guest-rounds';

/** The sections the guest page shows one at a time (the projection is a tab of its own). */
export type GuestSection = 'rounds' | 'ranking' | 'finals';

/** The section an update points at: the participants and the rounds are both under "Partidas". */
export function sectionOf(target: UpdateTarget): GuestSection {
  return target === 'guest-finals' ? 'finals' : target === 'guest-ranking' ? 'ranking' : 'rounds';
}

/** Where the "new updates" button goes to: the part of the page that changed between two states. */
export function updateTarget(previous: TournamentState, next: TournamentState): UpdateTarget {
  if (JSON.stringify(previous.finals) !== JSON.stringify(next.finals) || (!previous.finishedAt && next.finishedAt))
    return 'guest-finals';
  if (JSON.stringify(previous.players) !== JSON.stringify(next.players))
    return next.rounds.length ? 'guest-ranking' : 'guest-participants';
  if (JSON.stringify(previous.rounds) !== JSON.stringify(next.rounds)) return 'guest-rounds';
  return next.rounds.length ? 'guest-ranking' : 'guest-participants';
}
