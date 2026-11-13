import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { DashboardInsights } from '../../../core/dashboard-insights';
import { APP_CONFIG } from '../../../core/ports/app-config.port';
import { AUTH } from '../../../core/ports/auth.port';
import { CLOCK } from '../../../core/ports/clock.port';
import { DASHBOARD, type DashboardActivity, type DashboardMetrics } from '../../../core/ports/dashboard.port';
import { URL_STATE } from '../../../core/routing/url-state';
import { errorMessage } from '../../../shared/parsers/error-message';
import {
  abandonmentStages,
  buildDashboardView,
  type DashboardTab,
  type ListMode,
  mainDropoff,
  visibleTournaments,
} from './dashboard-view';

/**
 * Why the dashboard cannot show its numbers, as a key of `dashboard.errors.*`. `detail` is the auth service's own
 * message for a failed sign-in link, shown as it is (as before the extraction).
 */
export interface DashboardError {
  key: 'sendFailed' | 'unauthorized';
  detail?: string;
}

/**
 * The state of the admin dashboard (`/dashboard`): the e-mail sign-in, then the product numbers. Provided by
 * `DashboardComponent`, so it lives and dies with the page; its auth subscription stops on destroy.
 */
@Injectable()
export class DashboardStore {
  private readonly auth = inject(AUTH);
  private readonly dashboard = inject(DASHBOARD);
  private readonly clock = inject(CLOCK);
  private readonly urlState = inject(URL_STATE);
  private readonly config = inject(APP_CONFIG);

  readonly basePath = this.urlState.basePath;
  readonly versionLabel = this.config.buildVersion ? `v${this.config.buildVersion}` : 'dev';
  readonly authenticated = signal(false);
  readonly email = signal('');
  readonly magicLinkSent = signal(false);
  readonly loading = signal(false);
  readonly error = signal<DashboardError | null>(null);
  readonly metrics = signal<DashboardMetrics | null>(null);
  readonly activity = signal<DashboardActivity | null>(null);
  readonly insights = signal<DashboardInsights | null>(null);
  /** The database does not have the insights yet (an older migration): the new panels are hidden. */
  readonly insightsMissing = signal(false);
  readonly days = signal(30);
  readonly tab = signal<DashboardTab>('summary');
  readonly listMode = signal<ListMode>('active');
  readonly search = signal('');
  readonly updatedAt = signal<Date | null>(null);

  readonly stages = computed(() => abandonmentStages(this.activity()));
  readonly stagesTotal = computed(() => this.stages().reduce((sum, stage) => sum + stage.count, 0));
  readonly dropoff = computed(() => mainDropoff(this.stages()));
  readonly view = computed(() => {
    const insights = this.insights();
    return insights ? buildDashboardView(insights, this.dropoff()) : null;
  });
  /** The chosen list after the search, each with the link that opens it in the admin viewer. */
  readonly visibleTournaments = computed(() =>
    visibleTournaments(this.activity(), this.listMode(), this.search()).map((tournament) => ({
      ...tournament,
      viewerUrl: this.urlState.dashboardViewerUrl(tournament.id, tournament.source),
    })),
  );

  constructor() {
    const stop = this.auth.onAuthStateChange((change, user) => {
      if (change === 'signed-in' && user) this.signedIn();
      if (change === 'signed-out') {
        this.authenticated.set(false);
        this.metrics.set(null);
        this.activity.set(null);
      }
    });
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      stop();
    });
    // A sign-in return is finished by AppComponent's startup; the change above reports it. An existing session is read here.
    void this.auth.currentUser().then((user) => {
      if (user && !destroyed) this.signedIn();
    });
  }

  async requestMagicLink(): Promise<void> {
    const email = this.email().trim();
    if (!email || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.magicLinkSent.set(false);
    try {
      await this.auth.requestModeratorLogin(email, this.urlState.dashboardUrl());
      this.magicLinkSent.set(true);
    } catch (error) {
      const detail = errorMessage(error);
      this.error.set(detail ? { key: 'sendFailed', detail } : { key: 'sendFailed' });
    } finally {
      this.loading.set(false);
    }
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [metrics, activity] = await Promise.all([
        this.dashboard.getDashboardMetrics(),
        this.dashboard.getDashboardActivity(),
      ]);
      this.metrics.set(metrics);
      this.activity.set(activity);
      await this.loadInsights();
      this.updatedAt.set(this.clock.date());
    } catch {
      this.error.set({ key: 'unauthorized' });
    } finally {
      this.loading.set(false);
    }
  }

  /** Another period reloads only the insights (the totals and lists do not depend on it). */
  async setDays(days: number): Promise<void> {
    if (days === this.days() || this.loading()) return;
    this.days.set(days);
    this.loading.set(true);
    try {
      await this.loadInsights();
      this.updatedAt.set(this.clock.date());
    } finally {
      this.loading.set(false);
    }
  }

  private signedIn(): void {
    this.authenticated.set(true);
    void this.load();
  }

  /** Insights are optional: an older database simply hides the new panels. */
  private async loadInsights(): Promise<void> {
    try {
      const insights = await this.dashboard.getDashboardInsights(this.days());
      this.insightsMissing.set(insights === null);
      this.insights.set(insights);
    } catch {
      this.insights.set(null);
    }
  }
}
