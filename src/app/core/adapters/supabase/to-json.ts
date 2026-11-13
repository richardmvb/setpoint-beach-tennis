import type { Json } from './database.types';

/** Converts app data (plain objects, arrays, strings, numbers) to the `Json` type the generated Supabase types expect. */
export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}
