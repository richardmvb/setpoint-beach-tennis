import type { PlayerGender, TournamentState } from '../../core/models';
import { isMixedDoubles } from '../tournament-view/format';

type BatchError = 'name' | 'duplicate' | 'category' | 'full';

export interface BatchDraft {
  name: string;
  gender: PlayerGender | '';
  error?: BatchError;
}

function genderOf(value: string): PlayerGender | '' {
  const normalized = value.trim().toLowerCase();
  if (['m', 'masculino', 'male'].includes(normalized)) return 'male';
  if (['f', 'feminino', 'female'].includes(normalized)) return 'female';
  return '';
}

/** One athlete per line; in mixed doubles the category follows a comma, semicolon or tab. */
export function parseBatch(text: string): { name: string; gender: PlayerGender | '' }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\t,;]/).map((part) => part.trim());
      const last = parts.length > 1 ? genderOf(parts[parts.length - 1]) : '';
      return { name: last ? parts.slice(0, -1).join(' ').trim() : parts[0], gender: last };
    });
}

/** Marks what stops each draft from being added: no name, a name already taken, no category, or no free place. */
export function validateBatch(drafts: readonly BatchDraft[], state: TournamentState): BatchDraft[] {
  const names = new Set(state.players.map((player) => player.name.trim().toLocaleLowerCase()));
  const remaining = state.size - state.players.length;
  const mixed = isMixedDoubles(state);
  return drafts.map((draft, index) => {
    const name = draft.name.trim();
    const key = name.toLocaleLowerCase();
    const error: BatchError | undefined = !name
      ? 'name'
      : names.has(key)
        ? 'duplicate'
        : mixed && !draft.gender
          ? 'category'
          : index >= remaining
            ? 'full'
            : undefined;
    names.add(key);
    const { error: _previous, ...rest } = draft;
    return error ? { ...rest, error } : rest;
  });
}

export function canConfirmBatch(drafts: readonly BatchDraft[]): boolean {
  return drafts.length > 0 && drafts.every((draft) => !draft.error);
}
