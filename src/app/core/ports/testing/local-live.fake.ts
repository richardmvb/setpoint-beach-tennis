import type { LocalLiveTournamentSnapshot } from '../../models';
import type { LocalLiveRepository } from '../tournaments.port';

/** The part of the repository a viewer uses: read a published tournament with its read token. */
export type LocalLiveViewerPort = Pick<LocalLiveRepository, 'getLocalLiveTournament'>;

/** In-memory live tournaments for specs: `given` publishes one behind a read token, `fail` refuses the next reads. */
export class FakeLocalLive implements LocalLiveViewerPort {
  private readonly tournaments = new Map<string, LocalLiveTournamentSnapshot>();
  private failure: string | null = null;
  /** The read tokens asked for, in order. */
  readonly reads: string[] = [];

  given(readToken: string, snapshot: LocalLiveTournamentSnapshot): void {
    this.tournaments.set(readToken, structuredClone(snapshot));
  }
  fail(code: string | null): void {
    this.failure = code;
  }

  getLocalLiveTournament(readToken: string): Promise<LocalLiveTournamentSnapshot> {
    this.reads.push(readToken);
    if (this.failure) return Promise.reject(new Error(this.failure));
    const snapshot = this.tournaments.get(readToken);
    return snapshot ? Promise.resolve(structuredClone(snapshot)) : Promise.reject(new Error('invalid_live_link'));
  }
}
