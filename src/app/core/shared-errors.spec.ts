import { describe, expect, it } from 'vitest';
import { moderatorAuthError, sharedError } from './shared-errors';

describe('shared tournament errors', () => {
  it.each([
    ['invalid_live_link', 'invalidLiveLink'],
    ['authentication_required', 'authRequired'],
    ['tournament_completed', 'completed'],
    ['registration_closed', 'registrationClosed'],
    ['invite_expired', 'registrationClosed'],
    ['tournament_full', 'full'],
    ['tournament_expired', 'expired'],
    ['participant_not_removable', 'notRemovable'],
    ['rounds_locked', 'roundsLocked'],
    ['invalid_invite', 'invalidInvite'],
  ])('maps the server code %s to %s', (code, key) => {
    expect(sharedError(new Error(`P0001: ${code}`))).toEqual({ key });
  });

  it('shows an unknown server message as it came, and a missing one as unavailable', () => {
    expect(sharedError(new Error('boom'))).toEqual({ key: 'raw', detail: 'boom' });
    expect(sharedError(undefined)).toEqual({ key: 'unavailable' });
  });

  it('tells the moderator when anonymous sign-in is off', () => {
    expect(moderatorAuthError(new Error('Anonymous sign-ins are disabled'))).toEqual({ key: 'anonymousDisabled' });
    expect(moderatorAuthError(new Error('network'))).toEqual({ key: 'raw', detail: 'network' });
    expect(moderatorAuthError(undefined)).toEqual({ key: 'signInFailed' });
  });
});
