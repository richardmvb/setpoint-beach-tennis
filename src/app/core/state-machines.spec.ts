import { describe, expect, it } from 'vitest';
import { Round } from './models';
import {
  SYNC_STATUS_LABEL,
  SyncStatusInput,
  TOURNAMENT_PHASE_FLOW,
  TOURNAMENT_PHASE_LABEL,
  canTransitionTournamentPhase,
  syncStatus,
  tournamentPhase,
} from './state-machines';

const round: Round = { number: 1, matches: [], restingPlayerIds: [] };

describe('state machines', () => {
  it('a fase do torneio é derivada do estado, do cadastro ao encerramento', () => {
    const phase = tournamentPhase;
    expect(phase({ rounds: [], finals: null })).toBe('setup');
    expect(phase({ rounds: [], hostingMode: 'shared', sharedStatus: 'registration' })).toBe('registration');
    expect(phase({ rounds: [], hostingMode: 'shared', sharedStatus: 'ready' })).toBe('ready');
    expect(phase({ rounds: [round], hostingMode: 'shared', sharedStatus: 'active' })).toBe('qualifying');
    expect(phase({ rounds: [round], finals: { matches: [], complete: false, podiumPlayerIds: [] } })).toBe('finals');
    expect(
      phase({
        rounds: [round],
        finals: { matches: [], complete: true, podiumPlayerIds: [] },
        finishedAt: '2026-11-09T10:00:00Z',
      }),
    ).toBe('finished');
  });

  it('finalizado é terminal e nenhuma fase volta ao início', () => {
    const flow = TOURNAMENT_PHASE_FLOW;
    expect(flow.finished).toStrictEqual([]);
    for (const [from, targets] of Object.entries(flow)) {
      expect(targets.includes('setup'), `${from} não volta para setup`).toBe(false);
      for (const target of targets) expect(flow[target]).toBeDefined();
    }
    expect(canTransitionTournamentPhase('qualifying', 'finals')).toBe(true);
    expect(canTransitionTournamentPhase('finished', 'finals')).toBe(false);
    expect(canTransitionTournamentPhase('finals', 'finals')).toBe(true);
    for (const label of Object.values(TOURNAMENT_PHASE_LABEL)) expect(label.length).toBeGreaterThan(0);
  });

  it('o status de sincronização preserva a precedência e os textos originais', () => {
    const base: SyncStatusInput = {
      available: true,
      error: false,
      online: true,
      paused: false,
      inFlight: false,
      hasPending: false,
    };
    const check = (patch: Partial<SyncStatusInput>, status: string, label: string): void => {
      const result = syncStatus({ ...base, ...patch });
      expect(result).toBe(status);
      expect(SYNC_STATUS_LABEL[result]).toBe(label);
    };
    check({ available: false, error: true }, 'device-only', 'Salvo neste dispositivo');
    check({ error: true, online: false }, 'error', 'Sincronização pendente');
    check({ online: false, paused: true }, 'offline', 'Sem conexão');
    check({ paused: true, inFlight: true }, 'paused', 'Modo offline');
    check({ inFlight: true, hasPending: true }, 'syncing', 'Sincronizando');
    check({ hasPending: true }, 'pending', 'Aguardando sincronização');
    check({}, 'synced', 'Sincronizado');
  });
});
