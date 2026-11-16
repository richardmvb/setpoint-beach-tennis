import { errorMessage } from '../shared/parsers/error-message';

/**
 * What went wrong with a shared tournament, as data. The screen turns the key into words; `raw` carries a message the
 * server sent that has no key of its own (it shows `detail` as it came).
 */
type SharedErrorKey =
  | 'invalidLiveLink'
  | 'authRequired'
  | 'completed'
  | 'registrationClosed'
  | 'full'
  | 'expired'
  | 'notRemovable'
  | 'roundsLocked'
  | 'invalidInvite'
  | 'anonymousDisabled'
  | 'signInFailed'
  | 'unavailable'
  | 'categoryRequired'
  | 'copyFailed'
  | 'raw';

export interface SharedError {
  key: SharedErrorKey;
  detail?: string;
}

/** The server's error code (`tournament_full`, ...) found in a failed call. Unknown text is shown as it came. */
export function sharedError(error: unknown): SharedError {
  const message = errorMessage(error);
  const codes: [string, SharedErrorKey][] = [
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
  ];
  const found = codes.find(([code]) => message.includes(code));
  if (found) return { key: found[1] };
  return message ? { key: 'raw', detail: message } : { key: 'unavailable' };
}

/** Why the moderator could not sign in without an e-mail. */
export function moderatorAuthError(error: unknown): SharedError {
  const message = errorMessage(error);
  if (/anonymous/i.test(message)) return { key: 'anonymousDisabled' };
  return message ? { key: 'raw', detail: message } : { key: 'signInFailed' };
}
