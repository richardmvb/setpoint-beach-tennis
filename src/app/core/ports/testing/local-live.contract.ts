import { describe, expect, it } from 'vitest';
import { errorMessage } from '../../../shared/parsers/error-message';
import type { LocalLiveTournamentSnapshot } from '../../models';
import type { LocalLiveViewerPort } from './local-live.fake';

export interface LocalLiveHarness {
  port: LocalLiveViewerPort;
  /** The server has this tournament published behind this read token. */
  given: (readToken: string, snapshot: LocalLiveTournamentSnapshot) => void;
  /** The server refuses the next reads with this error code (for example `invalid_live_link`). */
  fail: (code: string) => void;
}

/** A published local tournament, as the server sends it. */
function liveSnapshot(overrides: Partial<LocalLiveTournamentSnapshot> = {}): LocalLiveTournamentSnapshot {
  return {
    id: 'live-1',
    status: 'active',
    state: {
      version: 1,
      name: 'Torneio ao vivo',
      size: 8,
      courts: 2,
      gamesToWin: 4,
      roundCount: 7,
      players: [{ id: 'p1', name: 'Ana' }],
      rounds: [],
      createdAt: '2026-11-13T10:00:00.000Z',
      hostingMode: 'local',
    },
    ...overrides,
  };
}

/** What a live viewer relies on from every LocalLiveRepository implementation. */
export function localLiveContract(name: string, create: () => LocalLiveHarness): void {
  describe(`LocalLiveRepository viewer contract: ${name}`, () => {
    it('reads the tournament behind a read token', async () => {
      const { port, given } = create();
      given('read-1', liveSnapshot({ status: 'completed' }));
      const snapshot = await port.getLocalLiveTournament('read-1');
      expect(snapshot.id).toBe('live-1');
      expect(snapshot.status).toBe('completed');
      expect(snapshot.state.name).toBe('Torneio ao vivo');
    });

    it('a refused read rejects with the server code in the message', async () => {
      const { port, given, fail } = create();
      given('read-1', liveSnapshot());
      fail('invalid_live_link');
      const error: unknown = await port.getLocalLiveTournament('read-1').catch((caught: unknown) => caught);
      expect(errorMessage(error)).toContain('invalid_live_link');
    });
  });
}
