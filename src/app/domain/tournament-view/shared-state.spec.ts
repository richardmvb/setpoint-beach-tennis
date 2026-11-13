import { describe, expect, it } from 'vitest';
import type { SharedTournamentSnapshot } from '../../core/models';
import storedSnapshot from '../../../../tests/fixtures/persisted/shared-snapshot/v1.json';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import { normalizeSharedState } from './shared-state';

function snapshot(overrides: Partial<SharedTournamentSnapshot> = {}): SharedTournamentSnapshot {
  return {
    id: 'shared-1',
    status: 'active',
    capacity: 8,
    state: tournamentState({ players: namedPlayers(8) }),
    inviteExpiresAt: '2026-11-20T10:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

describe('normalizeSharedState', () => {
  it('marks the state as this shared tournament', () => {
    const state = normalizeSharedState(snapshot({ status: 'registration' }));
    expect(state).toMatchObject({
      hostingMode: 'shared',
      sharedTournamentId: 'shared-1',
      sharedStatus: 'registration',
    });
  });

  it('fills the fields an older client did not save', () => {
    const state = normalizeSharedState(snapshot());
    expect(state).toMatchObject({
      tournamentMode: 'super',
      groupFormat: 'rotating',
      groups: [],
      fixedPairs: [],
      finals: null,
      tieBreakDraws: [],
    });
  });

  it('gives a full fixed-pairs roster its default pairs, and keeps pairs already chosen', () => {
    const fixed = tournamentState({ tournamentMode: 'groups', groupFormat: 'fixed', players: namedPlayers(8) });
    expect(normalizeSharedState(snapshot({ state: fixed })).fixedPairs).toHaveLength(4);
    const chosen: [string, string][] = [
      ['p1', 'p8'],
      ['p2', 'p7'],
      ['p3', 'p6'],
      ['p4', 'p5'],
    ];
    expect(normalizeSharedState(snapshot({ state: { ...fixed, fixedPairs: chosen } })).fixedPairs).toEqual(chosen);
  });

  it('does not change the snapshot it reads', () => {
    const original = snapshot();
    const copy = structuredClone(original);
    normalizeSharedState(original);
    expect(original).toEqual(copy);
  });

  it('reads the stored v1 shared snapshot without losing data', () => {
    const stored = storedSnapshot as unknown as SharedTournamentSnapshot;
    const state = normalizeSharedState(stored);
    expect(state.players).toEqual(stored.state.players);
    expect(state.rounds).toEqual(stored.state.rounds);
    expect(state.sharedTournamentId).toBe(stored.id);
  });
});
