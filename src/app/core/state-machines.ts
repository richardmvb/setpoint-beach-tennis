import { TournamentState } from './models';

/**
 * Explicit state machines that used to be implicit in app.component.ts.
 * Pure functions only: no Angular, no storage, no network. See docs/state-machines.md.
 */

// ── Tournament lifecycle ────────────────────────────────────────────────────
// Derived from the persisted TournamentState, never stored, so it cannot drift.

export type TournamentPhase = 'setup' | 'registration' | 'ready' | 'qualifying' | 'finals' | 'finished';

export const TOURNAMENT_PHASE_FLOW: Readonly<Record<TournamentPhase, readonly TournamentPhase[]>> = {
  setup: ['registration', 'qualifying'],
  registration: ['ready', 'qualifying'],
  ready: ['registration', 'qualifying'],
  qualifying: ['finals', 'finished'],
  finals: ['finished'],
  finished: []
};

export const TOURNAMENT_PHASE_LABEL: Readonly<Record<TournamentPhase, string>> = {
  setup: 'Configuração',
  registration: 'Inscrições',
  ready: 'Pronto para iniciar',
  qualifying: 'Em andamento',
  finals: 'Finais',
  finished: 'Finalizado'
};

export function tournamentPhase(
  state: Pick<TournamentState, 'rounds' | 'finals' | 'finishedAt' | 'hostingMode' | 'sharedStatus'>
): TournamentPhase {
  if (state.finishedAt) return 'finished';
  if (state.finals) return 'finals';
  if (state.rounds.length > 0) return 'qualifying';
  if (state.hostingMode === 'shared') {
    if (state.sharedStatus === 'registration') return 'registration';
    if (state.sharedStatus === 'ready') return 'ready';
  }
  return 'setup';
}

export function canTransitionTournamentPhase(from: TournamentPhase, to: TournamentPhase): boolean {
  return from === to || TOURNAMENT_PHASE_FLOW[from].includes(to);
}

// ── Synchronization status ──────────────────────────────────────────────────
// Precedence is the order of the checks below: the first match wins.

export type SyncStatus = 'device-only' | 'error' | 'offline' | 'paused' | 'syncing' | 'pending' | 'synced';

export interface SyncStatusInput {
  available: boolean;
  error: boolean;
  online: boolean;
  paused: boolean;
  inFlight: boolean;
  hasPending: boolean;
}

export const SYNC_STATUS_LABEL: Readonly<Record<SyncStatus, string>> = {
  'device-only': 'Salvo neste dispositivo',
  error: 'Sincronização pendente',
  offline: 'Sem conexão',
  paused: 'Modo offline',
  syncing: 'Sincronizando',
  pending: 'Aguardando sincronização',
  synced: 'Sincronizado'
};

export function syncStatus(input: SyncStatusInput): SyncStatus {
  if (!input.available) return 'device-only';
  if (input.error) return 'error';
  if (!input.online) return 'offline';
  if (input.paused) return 'paused';
  if (input.inFlight) return 'syncing';
  return input.hasPending ? 'pending' : 'synced';
}
