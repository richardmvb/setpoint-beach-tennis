import { inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { CurrentTournament } from '../current-tournament';
import type { Page } from '../models';
import { ANALYTICS } from '../ports/analytics.port';
import { ShellContext } from '../shell-context';
import { URL_STATE } from './url-state';

export type NavigationSource = 'user' | 'system';

/**
 * Which page the shell shows, and the address that goes with it (`/dashboard` or home). A root service so the sync and
 * the archive can ask whether the dashboard is open, and the flows can move the person to a page.
 */
@Injectable({ providedIn: 'root' })
export class AppNavigation {
  private readonly urlState = inject(URL_STATE);
  private readonly context = inject(ShellContext);
  private readonly tournament = inject(CurrentTournament);
  private readonly analytics = inject(ANALYTICS);
  private readonly current = signal<Page>('setup');
  private readonly dashboard = signal(this.context.startsOnDashboard);
  private readonly source = signal<NavigationSource>('user');

  readonly page = this.current.asReadonly();
  readonly dashboardRoute = this.dashboard.asReadonly();
  /** Who made the last change: the person (a click, the back button) or the app itself (a sync result). */
  readonly lastSource = this.source.asReadonly();
  /** The page being left, before the next one is set (the projection records what it showed). */
  readonly left$ = new Subject<Page>();

  /** Sets the first page without leaving anything or recording a view (the shell does that at start). */
  initialize(page: Page): void {
    this.current.set(page);
  }

  setPage(page: Page, source: NavigationSource = 'user'): void {
    if (this.current() === page && (page !== 'dashboard' || this.dashboard())) return;
    this.source.set(source);
    if (page === 'dashboard') {
      this.dashboard.set(true);
      this.urlState.goToDashboard();
    } else if (this.dashboard()) {
      this.dashboard.set(false);
      this.urlState.goHome();
    }
    this.left$.next(this.current());
    this.current.set(page);
    this.trackViewed(page);
  }

  /** The person moved back or forward between home and the dashboard. True when the dashboard just opened. */
  restoreFromPath(): boolean {
    const dashboard = this.urlState.snapshot().dashboardPath;
    if (dashboard === this.dashboard()) return false;
    this.dashboard.set(dashboard);
    this.source.set('user');
    if (dashboard) this.current.set('dashboard');
    else
      this.current.set(
        this.context.isSharedView ? 'shared' : this.tournament.state().rounds.length ? 'overview' : 'setup',
      );
    return dashboard;
  }

  trackViewed(page: Page): void {
    this.analytics.capture('feature_viewed', {
      feature: page === 'rounds' ? 'matches' : page,
      hosting_mode: this.tournament.state().hostingMode,
      is_guest_view: this.context.isSharedView,
    });
  }
}
