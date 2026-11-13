import { Match, TournamentHostingMode, TournamentMode, TournamentSize, TournamentState } from './models';
import type { KeyValueStore } from './ports/key-value-store.port';
import { TournamentPhase, tournamentPhase } from './state-machines';

/**
 * Device-side history of every tournament that was started here.
 * The active slot (StorageService) holds the tournament being edited; the library keeps
 * a copy of each one so that reset, import, or an app update never makes a tournament disappear.
 * Pure: depends only on a Storage-like object, so it can be unit tested without a browser.
 */

export interface LibraryEntry {
  id: string;
  name: string;
  mode: TournamentMode;
  hosting: TournamentHostingMode;
  size: TournamentSize;
  playerCount: number;
  phase: TournamentPhase;
  matchesCompleted: number;
  matchesTotal: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  /** Size of the stored copy, used to keep the library from crowding out the active tournament. */
  bytes?: number;
  /** Local tournaments only: the full state still has to be uploaded to the cloud archive. */
  archivePending: boolean;
}

interface LibraryIndex {
  version: 1;
  entries: LibraryEntry[];
}

const MAX_LIBRARY_ENTRIES = 30;
/** localStorage is ~5 MB shared with the active tournament and sync queues: the history gets a small slice. */
const MAX_LIBRARY_BYTES = 1_500_000;
const INDEX_KEY = 'setpoint.library.v1';
const STATE_PREFIX = 'setpoint.library.v1.state.';

type LibraryStorage = Pick<KeyValueStore, 'getItem' | 'setItem' | 'removeItem'>;

/** Stable identity of a tournament across saves; null while it has not been started/identified yet. */
export function libraryId(
  state: Pick<TournamentState, 'hostingMode' | 'sharedTournamentId' | 'analyticsId'>,
): string | null {
  if (state.hostingMode === 'shared') return state.sharedTournamentId ? `shared-${state.sharedTournamentId}` : null;
  return state.analyticsId ?? null;
}

/** Photos are the bulk of a state and are not needed to review results. */
function withoutPhotos(state: TournamentState): TournamentState {
  return { ...state, players: state.players.map(({ photoDataUrl: _photo, ...player }) => player) };
}

function allMatches(state: TournamentState): Match[] {
  return [...state.rounds.flatMap((round) => round.matches), ...(state.finals?.matches ?? [])];
}

export class TournamentLibrary {
  constructor(
    private readonly storage: LibraryStorage,
    private readonly parse: (raw: string) => TournamentState | null = (raw) => {
      try {
        return JSON.parse(raw) as TournamentState;
      } catch {
        return null;
      }
    },
    private readonly maxEntries = MAX_LIBRARY_ENTRIES,
    private readonly clock: () => Date,
    private readonly maxBytes = MAX_LIBRARY_BYTES,
  ) {}

  list(): LibraryEntry[] {
    return [...this.readIndex().entries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  get(id: string): LibraryEntry | null {
    return this.readIndex().entries.find((entry) => entry.id === id) ?? null;
  }

  load(id: string): TournamentState | null {
    const raw = this.storage.getItem(STATE_PREFIX + id);
    return raw ? this.parse(raw) : null;
  }

  /** Saves (or refreshes) a started tournament. Returns null when there is nothing to keep. */
  save(state: TournamentState): LibraryEntry | null {
    const id = libraryId(state);
    if (!id || !state.rounds.length) return null;

    const snapshot = withoutPhotos(state);
    const serialized = JSON.stringify(snapshot);
    const index = this.readIndex();
    const previous = index.entries.find((entry) => entry.id === id);
    if (previous && this.storage.getItem(STATE_PREFIX + id) === serialized) return previous;

    const matches = allMatches(state);
    const hosting: TournamentHostingMode = state.hostingMode === 'shared' ? 'shared' : 'local';
    const entry: LibraryEntry = {
      id,
      name: state.name,
      mode: state.tournamentMode ?? 'super',
      hosting,
      size: state.size,
      playerCount: state.players.length,
      phase: tournamentPhase(state),
      matchesCompleted: matches.filter((match) => match.scoreA !== null && match.scoreB !== null).length,
      matchesTotal: matches.length,
      createdAt: state.createdAt,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      updatedAt: this.clock().toISOString(),
      bytes: serialized.length,
      archivePending: hosting === 'local',
    };

    const entries = [entry, ...index.entries.filter((item) => item.id !== id)];
    return this.commit(entries, id, serialized) ? entry : null;
  }

  remove(id: string): void {
    const index = this.readIndex();
    this.storage.removeItem(STATE_PREFIX + id);
    this.writeIndex({ ...index, entries: index.entries.filter((entry) => entry.id !== id) });
  }

  pendingArchives(): LibraryEntry[] {
    return this.list().filter((entry) => entry.hosting === 'local' && entry.archivePending);
  }

  /** Forces the next upload, e.g. when the cloud copy must learn about a newly linked live id. */
  requeue(id: string | undefined): void {
    if (!id) return;
    const index = this.readIndex();
    const entry = index.entries.find((item) => item.id === id && item.hosting === 'local');
    if (!entry) return;
    entry.archivePending = true;
    this.writeIndex(index);
  }

  /** Clears the pending flag only if the entry did not change while the upload was in flight. */
  markArchived(id: string, updatedAt: string): void {
    const index = this.readIndex();
    const entry = index.entries.find((item) => item.id === id);
    if (!entry || entry.updatedAt !== updatedAt) return;
    entry.archivePending = false;
    this.writeIndex(index);
  }

  private commit(entries: LibraryEntry[], id: string, serialized: string): boolean {
    let kept = entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, this.maxEntries);
    // Oldest entries go first when the history outgrows its byte budget; the one being saved always stays.
    let total = kept.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
    for (const entry of [...kept].reverse()) {
      if (total <= this.maxBytes) break;
      if (entry.id === id) continue;
      kept = kept.filter((item) => item !== entry);
      total -= entry.bytes ?? 0;
    }
    for (const dropped of entries.filter((entry) => !kept.includes(entry)))
      this.storage.removeItem(STATE_PREFIX + dropped.id);

    // Storage can be full: evict the oldest other entries one at a time and retry.
    for (;;) {
      try {
        this.storage.setItem(STATE_PREFIX + id, serialized);
        this.writeIndex({ version: 1, entries: kept });
        return true;
      } catch {
        const victim = [...kept].reverse().find((entry) => entry.id !== id);
        if (!victim) {
          this.storage.removeItem(STATE_PREFIX + id);
          return false;
        }
        this.storage.removeItem(STATE_PREFIX + victim.id);
        kept = kept.filter((entry) => entry !== victim);
      }
    }
  }

  private readIndex(): LibraryIndex {
    try {
      const raw = this.storage.getItem(INDEX_KEY);
      if (!raw) return { version: 1, entries: [] };
      const parsed = JSON.parse(raw) as Partial<LibraryIndex>;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return { version: 1, entries: [] };
      return { version: 1, entries: parsed.entries.filter((entry) => !!entry && typeof entry.id === 'string') };
    } catch {
      return { version: 1, entries: [] };
    }
  }

  private writeIndex(index: LibraryIndex): void {
    this.storage.setItem(INDEX_KEY, JSON.stringify(index));
  }
}
