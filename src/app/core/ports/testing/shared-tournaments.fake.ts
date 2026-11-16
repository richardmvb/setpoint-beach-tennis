import type { PlayerGender, SharedTournamentSnapshot, TournamentState } from '../../models';
import type { SharedTournamentRepository } from '../tournaments.port';

/** The part of the repository a guest uses: read a tournament from its invite, and join it. */
export type SharedTournamentGuestPort = Pick<
  SharedTournamentRepository,
  'getGuestName' | 'getSharedTournament' | 'joinSharedTournament'
>;

/** The part of the repository a moderator uses on the tournament they own. */
export type SharedTournamentOwnerPort = Pick<
  SharedTournamentRepository,
  | 'createSharedTournament'
  | 'getOwnedSharedTournament'
  | 'addSharedParticipant'
  | 'removeSharedParticipant'
  | 'cancelSharedTournament'
  | 'rotateSharedInvite'
>;

/**
 * In-memory shared tournaments for specs. `given` puts a tournament behind an invite token, `fail` makes the server
 * refuse the next calls with an error code (as the RPCs do), and a join adds the guest to the roster.
 */
export class FakeSharedTournaments implements SharedTournamentGuestPort, SharedTournamentOwnerPort {
  private readonly tournaments = new Map<string, SharedTournamentSnapshot>();
  private readonly guestNames = new Map<string, string>();
  private owned: SharedTournamentSnapshot | null = null;
  private rotations = 0;
  private failure: string | null = null;
  /** Every call, in order, for specs that check what was asked. */
  readonly calls: { method: string; args: unknown[] }[] = [];

  given(inviteToken: string, snapshot: SharedTournamentSnapshot): void {
    this.tournaments.set(inviteToken, structuredClone(snapshot));
  }
  /** The tournament the moderator owns: `create` returns it, and reads, joins and removals change it. */
  givenOwned(snapshot: SharedTournamentSnapshot): void {
    this.owned = structuredClone(snapshot);
  }
  fail(code: string | null): void {
    this.failure = code;
  }

  createSharedTournament(
    state: TournamentState,
    moderatorName: string,
    moderatorGender?: PlayerGender,
    moderatorPhoto?: string,
  ): Promise<SharedTournamentSnapshot> {
    this.calls.push({
      method: 'createSharedTournament',
      args: [state, moderatorName, moderatorGender, moderatorPhoto],
    });
    return this.answer(() => {
      this.owned ??= {
        id: 'shared-1',
        status: 'registration',
        capacity: state.size,
        state: {
          ...state,
          sharedTournamentId: 'shared-1',
          sharedStatus: 'registration',
          players: [{ id: 'moderator', name: moderatorName, gender: moderatorGender, photoDataUrl: moderatorPhoto }],
        },
        inviteToken: 'invite-1',
        inviteExpiresAt: '2099-01-01T00:00:00Z',
        expiresAt: null,
      };
      return structuredClone(this.owned);
    });
  }

  getOwnedSharedTournament(id: string): Promise<SharedTournamentSnapshot> {
    this.calls.push({ method: 'getOwnedSharedTournament', args: [id] });
    return this.answer(() => this.requireOwned(id));
  }

  addSharedParticipant(
    id: string,
    displayName: string,
    gender?: PlayerGender,
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot> {
    this.calls.push({ method: 'addSharedParticipant', args: [id, displayName, gender, photoDataUrl] });
    return this.answer(() => {
      const owned = this.requireOwned(id);
      if (owned.state.players.length >= owned.capacity) throw new Error('tournament_full');
      owned.state.players.push({
        id: `manual-${owned.state.players.length + 1}`,
        name: displayName,
        gender,
        photoDataUrl,
        manual: true,
      });
      if (owned.state.players.length === owned.capacity) {
        owned.status = 'ready';
        owned.state.sharedStatus = 'ready';
      }
      this.owned = owned;
      return structuredClone(owned);
    });
  }

  removeSharedParticipant(id: string, playerId: string): Promise<SharedTournamentSnapshot> {
    this.calls.push({ method: 'removeSharedParticipant', args: [id, playerId] });
    return this.answer(() => {
      const owned = this.requireOwned(id);
      const player = owned.state.players.find((item) => item.id === playerId);
      if (!player?.manual) throw new Error('participant_not_removable');
      owned.state.players = owned.state.players.filter((item) => item.id !== playerId);
      owned.status = 'registration';
      owned.state.sharedStatus = 'registration';
      this.owned = owned;
      return structuredClone(owned);
    });
  }

  cancelSharedTournament(id: string): Promise<void> {
    this.calls.push({ method: 'cancelSharedTournament', args: [id] });
    return this.answer(() => {
      this.requireOwned(id);
      this.owned = null;
    });
  }

  rotateSharedInvite(id: string): Promise<{ inviteToken: string; inviteExpiresAt: string }> {
    this.calls.push({ method: 'rotateSharedInvite', args: [id] });
    return this.answer(() => {
      const owned = this.requireOwned(id);
      this.rotations++;
      owned.inviteToken = `invite-rotated-${this.rotations}`;
      this.owned = owned;
      return { inviteToken: owned.inviteToken, inviteExpiresAt: owned.inviteExpiresAt };
    });
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

  private requireOwned(id: string): SharedTournamentSnapshot {
    if (!this.owned || this.owned.id !== id) throw new Error('invalid_invite');
    return structuredClone(this.owned);
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
