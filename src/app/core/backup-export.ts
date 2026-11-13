import type { TournamentState } from './models';
import type { AnalyticsPort } from './ports/analytics.port';
import type { Clock } from './ports/clock.port';

/** Downloads the tournament as a JSON backup (`setpoint-YYYY-MM-DD.json`) and records `backup_exported`. */
export function exportTournamentBackup(state: TournamentState, clock: Clock, analytics: AnalyticsPort): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `setpoint-${clock.iso().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  analytics.capture('backup_exported', {
    tournament_mode: state.tournamentMode,
    tournament_size: state.size,
    has_schedule: state.rounds.length > 0,
    is_finalized: !!state.finishedAt,
  });
}
