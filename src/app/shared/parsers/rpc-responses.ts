import * as v from 'valibot';
import type { DashboardActivity, DashboardLocalArchive, DashboardMetrics } from '../../core/supabase.service';
import type { DashboardInsights } from '../../core/dashboard-insights';
import type { LocalLiveTournamentSnapshot, SharedTournamentSnapshot, TournamentState } from '../../core/models';
import { isRecord } from './json';

/**
 * Parsers for the JSON that Supabase RPCs return. Each one checks the fields the app depends on and
 * throws a ValiError when the payload does not have them, so a changed or broken backend fails loudly
 * at the boundary instead of as `undefined` deep inside a component.
 */

const isTournamentState = (value: unknown): value is TournamentState =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  typeof value['size'] === 'number' &&
  Array.isArray(value['players']);

const sharedSnapshotSchema = v.custom<SharedTournamentSnapshot>(
  (value) =>
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['status'] === 'string' &&
    typeof value['capacity'] === 'number' &&
    isTournamentState(value['state']),
  'invalid shared tournament snapshot',
);

const localSnapshotSchema = v.custom<LocalLiveTournamentSnapshot>(
  (value) =>
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['status'] === 'string' &&
    isTournamentState(value['state']),
  'invalid live tournament snapshot',
);

const dashboardTournamentSchema = v.custom<DashboardLocalArchive & { status?: string }>(
  (value) => isRecord(value) && typeof value['id'] === 'string' && typeof value['updated_at'] === 'string',
  'invalid dashboard tournament',
);

const liveCreatedSchema = v.object({ id: v.string(), readToken: v.string(), writeToken: v.string() });
const inviteRotationSchema = v.object({ inviteToken: v.string(), inviteExpiresAt: v.string() });
const tournamentCoreSchema = v.custom<Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'>>(
  (value) =>
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['status'] === 'string' &&
    isTournamentState(value['state']),
  'invalid dashboard tournament detail',
);

const metricsSchema = v.custom<DashboardMetrics>(
  (value) =>
    isRecord(value) &&
    typeof value['tournaments_total'] === 'number' &&
    typeof value['participants_total'] === 'number',
  'invalid dashboard metrics',
);
const insightsSchema = v.custom<DashboardInsights>(
  (value) => isRecord(value) && isRecord(value['kpis']) && isRecord(value['period']) && Array.isArray(value['series']),
  'invalid dashboard insights',
);
const activitySchema = v.custom<DashboardActivity>(
  (value) =>
    isRecord(value) && Array.isArray(value['active_tournaments']) && Array.isArray(value['archived_tournaments']),
  'invalid dashboard activity',
);

export const parseSharedSnapshot = (data: unknown): SharedTournamentSnapshot => v.parse(sharedSnapshotSchema, data);
export const parseLocalLiveSnapshot = (data: unknown): LocalLiveTournamentSnapshot =>
  v.parse(localSnapshotSchema, data);
export const parseLocalLiveCreated = (data: unknown): { id: string; readToken: string; writeToken: string } =>
  v.parse(liveCreatedSchema, data);
export const parseInviteRotation = (data: unknown): { inviteToken: string; inviteExpiresAt: string } =>
  v.parse(inviteRotationSchema, data);
export const parseTournamentCore = (data: unknown): Pick<SharedTournamentSnapshot, 'id' | 'status' | 'state'> =>
  v.parse(tournamentCoreSchema, data);
export const parseDashboardMetrics = (data: unknown): DashboardMetrics => v.parse(metricsSchema, data);
export const parseDashboardInsights = (data: unknown): DashboardInsights => v.parse(insightsSchema, data);
export const parseDashboardActivity = (data: unknown): DashboardActivity => v.parse(activitySchema, data);
export const parseDashboardTournamentList = (data: unknown): (DashboardLocalArchive & { status?: string })[] =>
  v.parse(v.array(dashboardTournamentSchema), data ?? []);
