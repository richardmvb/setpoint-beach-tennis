import {
  baseLiveUrl,
  basePathOf,
  dashboardUrl,
  dashboardViewerUrl,
  inviteUrl,
  liveUrl,
  type DashboardSource,
  type UrlSnapshot,
} from './app-url';
import type { UrlState } from './url-state';

/** The parts of UrlState that do not depend on how the address is handled: the browser's current URL and base href. */
export abstract class BaseUrlState implements UrlState {
  readonly basePath = basePathOf(document.baseURI);

  abstract snapshot(): UrlSnapshot;
  abstract onPathChange(callback: () => void): () => void;
  abstract goToDashboard(): void;
  abstract goHome(): void;
  abstract clearAuthFragment(): Promise<void>;

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
