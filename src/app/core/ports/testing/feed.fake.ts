import type { TournamentFeed } from '../live-feed.port';

/** In-memory feed: `trigger` simulates another device changing a tournament. */
export class FakeTournamentFeed implements TournamentFeed {
  private readonly local = new Map<string, () => void>();
  private readonly shared = new Map<string, () => void>();

  watchLocal(id: string, onChange: () => void): () => void {
    this.local.set(id, onChange);
    return () => {
      if (this.local.get(id) === onChange) this.local.delete(id);
    };
  }
  watchShared(id: string, onChange: () => void): () => void {
    this.shared.set(id, onChange);
    return () => {
      if (this.shared.get(id) === onChange) this.shared.delete(id);
    };
  }
  stopSharedWatch(id: string): void {
    this.shared.delete(id);
  }
  trigger(kind: 'local' | 'shared', id: string): void {
    (kind === 'local' ? this.local : this.shared).get(id)?.();
  }
  /** The tournaments being watched, as `local:<id>` or `shared:<id>`, so a spec can check none is left open. */
  watching(): string[] {
    return [
      ...[...this.local.keys()].map((id) => `local:${id}`),
      ...[...this.shared.keys()].map((id) => `shared:${id}`),
    ];
  }
}
