import type { PlayerGender, SharedTournamentSnapshot, TournamentState } from '../../../core/models';
import type { DashboardRepository, DashboardTournamentSource } from '../../../core/ports/dashboard.port';
import type { TournamentFeed } from '../../../core/ports/live-feed.port';
import type { LocalLiveRepository, SharedTournamentRepository } from '../../../core/ports/tournaments.port';
import { type SharedViewError, sharedViewError } from './shared-view-errors';

export type SharedViewMode = 'invite' | 'live' | 'admin';
type ViewStatus = SharedTournamentSnapshot['status'];

/** A tournament as the page gets it, whatever the source. */
export interface ViewSnapshot {
  id: string;
  status: ViewStatus;
  state: TournamentState;
  /** Invite only: the server still accepts guests. */
  canJoin: boolean;
}

/** Where the page reads its tournament from. Each mode wraps one port and reads its token only from the URL. */
export interface SharedViewSource {
  readonly mode: SharedViewMode;
  /** How the tournament is hosted, as shown on the page (a live link is a local tournament). */
  readonly hostingMode: 'local' | 'shared';
  /** The first read. An invite also re-joins with the name this device used before, returned as `guestName`. */
  load(): Promise<{ snapshot: ViewSnapshot; guestName: string }>;
  refresh(): Promise<ViewSnapshot>;
  /** Realtime "something changed" for this tournament. Returns the function that stops watching. */
  watch(id: string, onChange: () => void): () => void;
  /** Whether the tournament can still change in this status: the poll and the watch stop when it cannot. */
  isOpen(status: ViewStatus | null): boolean;
  describeError(error: unknown): SharedViewError;
}

export interface InviteSource extends SharedViewSource {
  readonly mode: 'invite';
  join(name: string, gender: PlayerGender, photoDataUrl?: string): Promise<ViewSnapshot>;
}

const stillRunning = (status: ViewStatus | null): boolean => status !== 'completed' && status !== 'archived';

function fromShared(snapshot: SharedTournamentSnapshot): ViewSnapshot {
  return { id: snapshot.id, status: snapshot.status, state: snapshot.state, canJoin: !!snapshot.canJoin };
}

/** A guest following a shared tournament from its invite link. */
export function inviteSource(
  repository: Pick<SharedTournamentRepository, 'getGuestName' | 'getSharedTournament' | 'joinSharedTournament'>,
  feed: TournamentFeed,
  token: string,
): InviteSource {
  return {
    mode: 'invite',
    hostingMode: 'shared',
    async load() {
      const guestName = await repository.getGuestName(token);
      let snapshot = await repository.getSharedTournament(token);
      if (guestName) snapshot = await repository.joinSharedTournament(token, guestName);
      return { snapshot: fromShared(snapshot), guestName };
    },
    refresh: async () => fromShared(await repository.getSharedTournament(token)),
    join: async (name, gender, photoDataUrl) =>
      fromShared(await repository.joinSharedTournament(token, name, gender, photoDataUrl)),
    watch: (id, onChange) => feed.watchShared(id, onChange),
    // Before the first read there is nothing to refresh: the invite poll waits for a tournament.
    isOpen: (status) => status !== null && stillRunning(status),
    describeError: sharedViewError,
  };
}

/** Anyone following a local tournament from its public live link. */
export function liveSource(
  repository: Pick<LocalLiveRepository, 'getLocalLiveTournament'>,
  feed: TournamentFeed,
  token: string,
): SharedViewSource {
  const read = async (): Promise<ViewSnapshot> => {
    const snapshot = await repository.getLocalLiveTournament(token);
    const status: ViewStatus =
      snapshot.status === 'completed' || snapshot.status === 'archived'
        ? snapshot.status
        : snapshot.state.rounds.length
          ? 'active'
          : 'registration';
    return { id: snapshot.id, status, state: snapshot.state, canJoin: false };
  };
  return {
    mode: 'live',
    hostingMode: 'local',
    load: async () => ({ snapshot: await read(), guestName: '' }),
    refresh: read,
    watch: (id, onChange) => feed.watchLocal(id, onChange),
    isOpen: stillRunning,
    describeError: sharedViewError,
  };
}

/** An admin opening any tournament from the dashboard. It only changes while it is active. */
export function adminSource(
  repository: Pick<DashboardRepository, 'getDashboardTournament'>,
  feed: TournamentFeed,
  source: DashboardTournamentSource,
  id: string,
): SharedViewSource {
  const read = async (): Promise<ViewSnapshot> => {
    const tournament = await repository.getDashboardTournament(source, id);
    return { id: tournament.id, status: tournament.status, state: tournament.state, canJoin: false };
  };
  return {
    mode: 'admin',
    hostingMode: source === 'local' ? 'local' : 'shared',
    load: async () => ({ snapshot: await read(), guestName: '' }),
    refresh: read,
    watch: (watchedId, onChange) =>
      source === 'local' ? feed.watchLocal(watchedId, onChange) : feed.watchShared(watchedId, onChange),
    // Polled until the first read succeeds, then only while it is active.
    isOpen: (status) => status === null || status === 'active',
    describeError: () => ({ key: 'adminForbidden' }),
  };
}
