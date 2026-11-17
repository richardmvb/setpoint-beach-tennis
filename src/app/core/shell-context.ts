import { inject, Injectable } from '@angular/core';
import { URL_STATE } from './routing/url-state';

/**
 * What the address says about this session, read once at start. The address opens someone else's tournament (live
 * link, invite or admin viewer) when `isSharedView`: the page is then the lazy shared view, and none of the device's
 * own tournament, sync, library or version reset runs.
 */
@Injectable({ providedIn: 'root' })
export class ShellContext {
  private readonly url = inject(URL_STATE).snapshot();

  readonly isSharedView =
    !this.url.dashboardPath && !!(this.url.inviteToken || this.url.liveToken || this.url.dashboardViewerId);
  /** The hosting mode analytics reports for a shared view (its own tournament is the viewer's, not the device's). */
  readonly viewerHostingMode: 'shared' | 'local' = this.url.dashboardViewerId
    ? (this.url.dashboardViewerSource ?? 'shared')
    : this.url.liveToken
      ? 'local'
      : 'shared';
  /** The return from an e-mail sign-in is still in the address. */
  readonly authCallback = this.url.authCallback;
  readonly startsOnDashboard = this.url.dashboardPath;
}
