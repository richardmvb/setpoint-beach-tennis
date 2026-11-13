import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../../shared/parsers/error-message';
import type { SharedTournamentSnapshot } from '../../models';
import type { SharedTournamentGuestPort } from './shared-tournaments.fake';

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
