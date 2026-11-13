import { Injectable } from '@angular/core';
import {
  baseLiveUrl,
  basePathOf,
  dashboardUrl,
  dashboardViewerUrl,
  inviteUrl,
  liveUrl,
  parseUrl,
  type DashboardSource,
  type UrlSnapshot,
} from './app-url';
import type { UrlState } from './url-state';

/** The address handled with `window.location` and the History API, as the app always did. */
@Injectable({ providedIn: 'root' })
export class LegacyUrlState implements UrlState {
  readonly basePath = basePathOf(document.baseURI);

  snapshot(): UrlSnapshot {
    return parseUrl(window.location);
  }

  onPathChange(callback: () => void): () => void {
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
  }

  goToDashboard(): void {
    window.history.pushState({}, '', `${this.basePath}/dashboard`);
  }

  goHome(): void {
    window.history.pushState({}, '', `${this.basePath}/`);
  }

  /** `SupabaseAuth.finishUrlSignIn` already removed the hash from the address. */
  clearAuthFragment(): Promise<void> {
    return Promise.resolve();
  }

  inviteUrl(token: string): string {
    return inviteUrl(window.location.href, token);
  }

  liveUrl(token: string): string {
    return liveUrl(window.location.href, token);
  }

  baseLiveUrl(token: string): string {
    return baseLiveUrl(document.baseURI, token);
  }

  dashboardViewerUrl(id: string, source: DashboardSource): string {
    return dashboardViewerUrl(document.baseURI, id, source);
  }

  dashboardUrl(): string {
    return dashboardUrl(document.baseURI);
  }
}
