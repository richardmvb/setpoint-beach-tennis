import { errorMessage } from '../../../shared/parsers/error-message';

/** Why the page cannot show or join the tournament, as a key of `shared.errors.*`. */
type SharedViewErrorKey =
  | 'invalidLiveLink'
  | 'authentication'
  | 'completed'
  | 'inviteExpired'
  | 'full'
  | 'expired'
  | 'invalidInvite'
  | 'chooseCategory'
  | 'adminUnavailable'
  | 'adminForbidden'
  | 'liveNotConfigured'
  | 'sharedNotConfigured'
  | 'unknown';

/** `detail` is the server's own message, shown as it is when no key matches (as before the extraction). */
export interface SharedViewError {
  key: SharedViewErrorKey;
  detail?: string;
}

/** Server error codes a viewer can meet, in the order they are checked. */
const CODES: readonly (readonly [code: string, key: SharedViewErrorKey])[] = [
  ['invalid_live_link', 'invalidLiveLink'],
  ['authentication_required', 'authentication'],
  ['tournament_completed', 'completed'],
  ['registration_closed', 'inviteExpired'],
  ['invite_expired', 'inviteExpired'],
  ['tournament_full', 'full'],
  ['tournament_expired', 'expired'],
  ['invalid_invite', 'invalidInvite'],
];

/** The message for a failed invite or live-link call. */
export function sharedViewError(error: unknown): SharedViewError {
  const message = errorMessage(error);
  const match = CODES.find(([code]) => message.includes(code));
  if (match) return { key: match[1] };
  return message ? { key: 'unknown', detail: message } : { key: 'unknown' };
}
