import { isRecord } from './json';

/**
 * The message of a failed Supabase call. supabase-js returns RPC errors as plain objects (`{ code, message }`),
 * not `Error` instances, so `error instanceof Error` alone loses the message (for example `tournament_full`).
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error['message'] === 'string') return error['message'];
  return '';
}
