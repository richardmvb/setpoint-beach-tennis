import { InjectionToken } from '@angular/core';
import type { DashboardSource, UrlSnapshot } from './app-url';

/**
 * The app's view of its own address: what the URL says, and how to make or change one.
 * `AppComponent` and the features use this instead of `window.location` and `history`.
 */
export interface UrlState {
  /** The base href's path without the trailing slash. */
  readonly basePath: string;
  /** What the address says right now. */
  snapshot(): UrlSnapshot;
  /** Calls back when the person moves back or forward between `/` and `/dashboard`. Returns a function that stops it. */
  onPathChange(callback: () => void): () => void;
  goToDashboard(): void;
  goHome(): void;
  /** Called once the sign-in return has been handled: makes sure the tokens are gone from the address. */
  clearAuthFragment(): Promise<void>;
  inviteUrl(token: string): string;
  liveUrl(token: string): string;
  baseLiveUrl(token: string): string;
  dashboardViewerUrl(id: string, source: DashboardSource): string;
  dashboardUrl(): string;
}
export const URL_STATE = new InjectionToken<UrlState>('UrlState');
