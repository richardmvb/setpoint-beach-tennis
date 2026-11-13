import type { PlayerGender, SharedTournamentSnapshot } from '../../models';
import type { SharedTournamentRepository } from '../tournaments.port';

/** The part of the repository a guest uses: read a tournament from its invite, and join it. */
export type SharedTournamentGuestPort = Pick<
  SharedTournamentRepository,
  'getGuestName' | 'getSharedTournament' | 'joinSharedTournament'
>;

/**
 * In-memory shared tournaments for specs. `given` puts a tournament behind an invite token, `fail` makes the server
 * refuse the next calls with an error code (as the RPCs do), and a join adds the guest to the roster.
 */
export class FakeSharedTournaments implements SharedTournamentGuestPort {
  private readonly tournaments = new Map<string, SharedTournamentSnapshot>();
  private readonly guestNames = new Map<string, string>();
  private failure: string | null = null;
  /** Every call, in order, for specs that check what was asked. */
  readonly calls: { method: string; args: unknown[] }[] = [];

  given(inviteToken: string, snapshot: SharedTournamentSnapshot): void {
    this.tournaments.set(inviteToken, structuredClone(snapshot));
  }
  fail(code: string | null): void {
    this.failure = code;
  }

  getGuestName(inviteToken: string): Promise<string> {
    this.calls.push({ method: 'getGuestName', args: [inviteToken] });
    return Promise.resolve(this.guestNames.get(inviteToken) ?? '');
  }

  getSharedTournament(inviteToken: string): Promise<SharedTournamentSnapshot> {
    this.calls.push({ method: 'getSharedTournament', args: [inviteToken] });
    return this.answer(() => this.find(inviteToken));
  }

  joinSharedTournament(
    inviteToken: string,
    displayName: string,
    gender?: PlayerGender,
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot> {
    this.calls.push({ method: 'joinSharedTournament', args: [inviteToken, displayName, gender, photoDataUrl] });
    return this.answer(() => {
      const snapshot = this.find(inviteToken);
      const players = snapshot.state.players;
      if (!players.some((player) => player.name === displayName))
        players.push({ id: `guest-${players.length + 1}`, name: displayName, gender, photoDataUrl });
      this.tournaments.set(inviteToken, snapshot);
      this.guestNames.set(inviteToken, displayName);
      return structuredClone(snapshot);
    });
  }

  private find(inviteToken: string): SharedTournamentSnapshot {
    const snapshot = this.tournaments.get(inviteToken);
    if (!snapshot) throw new Error('invalid_invite');
    return structuredClone(snapshot);
  }

  private answer<T>(read: () => T): Promise<T> {
    if (this.failure) return Promise.reject(new Error(this.failure));
    try {
      return Promise.resolve(read());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
