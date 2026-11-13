import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('reads the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads the message of a plain PostgREST error object', () => {
    expect(errorMessage({ code: 'P0001', message: 'tournament_full', details: null, hint: null })).toBe(
      'tournament_full',
    );
  });

  it('returns an empty string for anything else', () => {
    for (const value of [undefined, null, 'text', 42, [], {}, { message: 7 }]) expect(errorMessage(value)).toBe('');
  });
});
