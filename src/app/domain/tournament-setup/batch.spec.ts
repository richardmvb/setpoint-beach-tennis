import { describe, expect, it } from 'vitest';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import { canConfirmBatch, parseBatch, validateBatch } from './batch';

describe('parsing a pasted list', () => {
  it('takes one athlete per line and drops blank lines', () => {
    expect(parseBatch('Ana\n\n  Bruno  \r\nCarla')).toEqual([
      { name: 'Ana', gender: '' },
      { name: 'Bruno', gender: '' },
      { name: 'Carla', gender: '' },
    ]);
  });

  it('reads the category after a comma, semicolon or tab, in several spellings', () => {
    expect(parseBatch('Ana, F\nBruno;masculino\nCarla\tfeminino\nDiego, M')).toEqual([
      { name: 'Ana', gender: 'female' },
      { name: 'Bruno', gender: 'male' },
      { name: 'Carla', gender: 'female' },
      { name: 'Diego', gender: 'male' },
    ]);
  });

  it('keeps a comma that is not followed by a category', () => {
    expect(parseBatch('Souza, Ana')).toEqual([{ name: 'Souza', gender: '' }]);
  });
});

describe('validating the list', () => {
  const state = tournamentState({ players: namedPlayers(6) });

  it('flags an empty name, a repeated name (also against the roster) and no free place', () => {
    const drafts = validateBatch(
      [
        { name: 'Ana', gender: '' },
        { name: 'Zé', gender: '' },
        { name: 'zé', gender: '' },
        { name: ' ', gender: '' },
        { name: 'Wil', gender: '' },
      ],
      state,
    );
    expect(drafts.map((d) => d.error)).toEqual(['duplicate', undefined, 'duplicate', 'name', 'full']);
  });

  it('asks for the category in mixed doubles only', () => {
    const mixed = tournamentState({ doublesFormat: 'mixed' });
    expect(validateBatch([{ name: 'Ana', gender: '' }], mixed)[0].error).toBe('category');
    expect(validateBatch([{ name: 'Ana', gender: '' }], tournamentState())[0].error).toBeUndefined();
  });

  it('clears an error that no longer applies and never changes the input', () => {
    const input = [{ name: 'Zé', gender: '' as const, error: 'name' as const }];
    const result = validateBatch(input, state);
    expect(result[0]).not.toHaveProperty('error');
    expect(input[0].error).toBe('name');
  });

  it('can be confirmed only when it is non-empty and clean', () => {
    expect(canConfirmBatch([])).toBe(false);
    expect(canConfirmBatch([{ name: 'A', gender: '', error: 'name' }])).toBe(false);
    expect(canConfirmBatch([{ name: 'A', gender: '' }])).toBe(true);
  });
});
