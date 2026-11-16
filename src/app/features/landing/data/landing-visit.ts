import type { KeyValueStore } from '../../../core/ports/key-value-store.port';

/** Set once the visitor leaves the landing page for the app, so later visits open the app directly. */
const LANDING_SEEN_KEY = 'setpoint.landing.seen';

/** Whether this device has already left the landing page. When storage cannot be read, the landing is skipped. */
export function landingSeen(local: Pick<KeyValueStore, 'getItem'>): boolean {
  try {
    return local.getItem(LANDING_SEEN_KEY) === 'true';
  } catch {
    return true;
  }
}

/** Remembers that the landing page was left. Without storage the landing simply shows again on the next visit. */
export function markLandingSeen(local: Pick<KeyValueStore, 'setItem'>): void {
  try {
    local.setItem(LANDING_SEEN_KEY, 'true');
  } catch {
    /* the landing shows again on the next visit */
  }
}
