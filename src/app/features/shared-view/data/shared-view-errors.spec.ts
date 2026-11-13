import { describe, expect, it } from 'vitest';
import { sharedViewError } from './shared-view-errors';

describe('sharedViewError', () => {
  it('finds the server code inside the message, from an Error or a Supabase error object', () => {
    expect(sharedViewError(new Error('P0001: invalid_live_link'))).toEqual({ key: 'invalidLiveLink' });
    expect(sharedViewError({ code: 'P0001', message: 'tournament_full' })).toEqual({ key: 'full' });
    expect(sharedViewError({ message: 'registration_closed' })).toEqual({ key: 'inviteExpired' });
  });

  it('keeps an unknown message as it is, and has a generic text when there is none', () => {
    expect(sharedViewError(new Error('Failed to fetch'))).toEqual({ key: 'unknown', detail: 'Failed to fetch' });
    expect(sharedViewError(undefined)).toEqual({ key: 'unknown' });
  });
});
