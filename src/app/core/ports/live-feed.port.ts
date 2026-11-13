import { InjectionToken } from '@angular/core';

/** Realtime "something changed" signals for tournaments being watched. The callback re-reads the data. */
export interface TournamentFeed {
  /** Watches a local (live link) tournament. Returns a function that stops watching. */
  watchLocal(id: string, onChange: () => void): () => void;
  /** Watches a shared tournament. Returns a function that stops watching. */
  watchShared(id: string, onChange: () => void): () => void;
  stopSharedWatch(id: string): void;
}
export const TOURNAMENT_FEED = new InjectionToken<TournamentFeed>('TournamentFeed');
