import { Injectable, type Provider } from '@angular/core';
import { parseUrl, type UrlSnapshot } from './app-url';
import { BaseUrlState } from './base-url-state';
import { URL_STATE } from './url-state';

/** The address handled with `window.location` and the History API, as the app always did. */
@Injectable({ providedIn: 'root' })
export class LegacyUrlState extends BaseUrlState {
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
}

export function provideLegacyUrlState(): Provider[] {
  return [{ provide: URL_STATE, useExisting: LegacyUrlState }];
}
