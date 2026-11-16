import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../../shared/parsers/error-message';
import type { SharedTournamentSnapshot } from '../../models';
import type { SharedTournamentGuestPort, SharedTournamentOwnerPort } from './shared-tournaments.fake';

export interface SharedTournamentsHarness {
  port: SharedTournamentGuestPort;
  /** The server has this tournament behind this invite token. */
  given: (inviteToken: string, snapshot: SharedTournamentSnapshot) => void;
  /** The server refuses the next calls with this error code (for example `invite_expired`). */
  fail: (code: string) => void;
}

/** A tournament in registration, as the server sends it. */
function sharedSnapshot(overrides: Partial<SharedTournamentSnapshot> = {}): SharedTournamentSnapshot {
  return {
    id: 'shared-1',
    status: 'registration',
    capacity: 8,
    state: {
      version: 1,
      name: 'Torneio compartilhado',
      size: 8,
      courts: 2,
      gamesToWin: 4,
      roundCount: 7,
      players: [{ id: 'p1', name: 'Moderadora' }],
      rounds: [],
      createdAt: '2026-11-13T10:00:00.000Z',
      hostingMode: 'shared',
    },
    inviteExpiresAt: '2099-01-01T00:00:00Z',
    expiresAt: null,
    canJoin: true,
    ...overrides,
  };
}

/** What a guest relies on from every SharedTournamentRepository implementation. */
export function sharedTournamentsContract(name: string, create: () => SharedTournamentsHarness): void {
  describe(`SharedTournamentRepository guest contract: ${name}`, () => {
    it('reads the tournament behind an invite', async () => {
      const { port, given } = create();
      given('invite-1', sharedSnapshot());
      const snapshot = await port.getSharedTournament('invite-1');
      expect(snapshot.id).toBe('shared-1');
      expect(snapshot.status).toBe('registration');
      expect(snapshot.state.name).toBe('Torneio compartilhado');
      expect(snapshot.canJoin).toBe(true);
    });

    it('has no guest name for an invite this device never joined', async () => {
      const { port, given } = create();
      given('invite-1', sharedSnapshot());
      expect(await port.getGuestName('invite-1')).toBe('');
    });

    it('a join returns the tournament and remembers the name for that invite only', async () => {
      const { port, given } = create();
      given('invite-1', sharedSnapshot());
      const snapshot = await port.joinSharedTournament('invite-1', 'Convidada', 'female');
      expect(snapshot.id).toBe('shared-1');
      expect(await port.getGuestName('invite-1')).toBe('Convidada');
      expect(await port.getGuestName('invite-2')).toBe('');
    });

    it('a refused read rejects with the server code in the message', async () => {
      const { port, given, fail } = create();
      given('invite-1', sharedSnapshot());
      fail('invite_expired');
      const error: unknown = await port.getSharedTournament('invite-1').catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('invite_expired');
    });

    it('a refused join rejects with the code and does not remember the name', async () => {
      const { port, given, fail } = create();
      given('invite-1', sharedSnapshot());
      fail('tournament_full');
      const error: unknown = await port.joinSharedTournament('invite-1', 'Atrasado').catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('tournament_full');
      expect(await port.getGuestName('invite-1')).toBe('');
    });
  });
}

export interface OwnedTournamentsHarness {
  port: SharedTournamentOwnerPort;
  /** The server has this tournament for its moderator, and answers the owner calls with it. */
  given: (snapshot: SharedTournamentSnapshot) => void;
  /** The server answers a new-invite call with this token and expiry. */
  givenRotation: (inviteToken: string, inviteExpiresAt: string) => void;
  /** The server refuses the next owner calls with this error code. */
  fail: (code: string) => void;
}

const ownedSnapshot = (): SharedTournamentSnapshot => sharedSnapshot({ inviteToken: 'invite-1' });

/** What the moderator relies on from every SharedTournamentRepository implementation. */
export function ownedSharedTournamentsContract(name: string, create: () => OwnedTournamentsHarness): void {
  describe(`SharedTournamentRepository moderator contract: ${name}`, () => {
    it('creates a tournament and returns it with its invite', async () => {
      const { port, given } = create();
      const snapshot = ownedSnapshot();
      given(snapshot);
      const created = await port.createSharedTournament(snapshot.state, 'Moderadora', 'female');
      expect(created.id).toBe('shared-1');
      expect(created.inviteToken).toBe('invite-1');
      expect(created.state.hostingMode).toBe('shared');
    });

    it('reads the tournament the moderator owns', async () => {
      const { port, given } = create();
      given(ownedSnapshot());
      const snapshot = await port.getOwnedSharedTournament('shared-1');
      expect(snapshot.id).toBe('shared-1');
      expect(snapshot.status).toBe('registration');
    });

    it('adds and removes a participant, answering with the tournament', async () => {
      const { port, given } = create();
      given(ownedSnapshot());
      expect((await port.addSharedParticipant('shared-1', 'Sem celular', 'male')).id).toBe('shared-1');
      expect((await port.removeSharedParticipant('shared-1', 'manual-2')).id).toBe('shared-1');
    });

    it('gives a new invite link', async () => {
      const { port, given, givenRotation } = create();
      given(ownedSnapshot());
      givenRotation('invite-2', '2099-02-01T00:00:00Z');
      const invite = await port.rotateSharedInvite('shared-1');
      expect(invite.inviteToken).toBeTruthy();
      expect(invite.inviteExpiresAt).toBeTruthy();
    });

    it('cancels the tournament', async () => {
      const { port, given } = create();
      given(ownedSnapshot());
      await expect(port.cancelSharedTournament('shared-1')).resolves.toBeUndefined();
    });

    it('a refused call rejects with the server code in the message', async () => {
      const { port, given, fail } = create();
      given(ownedSnapshot());
      fail('rounds_locked');
      const error: unknown = await port.getOwnedSharedTournament('shared-1').catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('rounds_locked');
    });
  });
}
