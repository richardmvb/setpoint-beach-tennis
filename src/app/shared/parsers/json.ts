import type { Json } from '../../core/database.types';

/** Converts app data (plain objects, arrays, strings, numbers) to the `Json` type the generated Supabase types expect. */
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

/** Parses text that may be anything (storage, imports). Returns `undefined` when it is not valid JSON. */
export function parseJson(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
