import { inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { parseUrl, type UrlSnapshot } from './app-url';
import { BaseUrlState } from './base-url-state';

/**
 * The address handled by the Angular Router. The router starts with a blocking initial navigation, so the redirects are
 * resolved before AppComponent is created and `snapshot()` can be read in its constructor.
 */
@Injectable()
export class RouterUrlState extends BaseUrlState {
  private readonly router = inject(Router);

  snapshot(): UrlSnapshot {
    // The blocking initial navigation lets the app start before the router commits its URL, so while it is still in
    // flight the address is on the navigation. Both are relative to the base href: "/dashboard?x=1#frag".
    const pending = this.router.currentNavigation()?.finalUrl;
    const relative = pending ? this.router.serializeUrl(pending) : this.router.url;
    return parseUrl(new URL(relative, 'http://base.invalid'));
  }

  onPathChange(callback: () => void): () => void {
    const subscription = this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(callback);
    return () => subscription.unsubscribe();
  }

  goToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  goHome(): void {
    void this.router.navigateByUrl('/');
  }

  /**
   * `SupabaseAuth.finishUrlSignIn` removed the tokens from the browser's address, but the router still holds them in its
   * own URL. Sync it, or a later navigation would write the token fragment back into the address bar and the history.
   */
  async clearAuthFragment(): Promise<void> {
    if (this.router.parseUrl(this.router.url).fragment === null) return;
    await this.router.navigate([], { fragment: undefined, queryParamsHandling: 'preserve', replaceUrl: true });
  }
}
