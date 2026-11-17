import { inject, Injectable, signal } from '@angular/core';
import { CurrentTournament } from './current-tournament';
import type { TournamentState } from './models';
import { ANALYTICS } from './ports/analytics.port';
import { AUTH } from './ports/auth.port';
import { LOCAL_STORE } from './ports/key-value-store.port';
import { RANDOM } from './ports/random.port';
import { LOCAL_LIVE } from './ports/tournaments.port';
import { URL_STATE } from './routing/url-state';

const LOCAL_LIVE_KEY = 'setpoint.local.live';

/** What went wrong with the live link, as data; the screen turns the key into words and shows `detail` as it came. */
export interface LiveLinkError {
  key: 'notConfigured' | 'createFailed' | 'copyFailed';
  detail?: string;
}

export interface LocalLiveHooks {
  /** The link was created: the shell starts the sync queue, saves, re-queues the archive and uploads it. */
  published(analyticsId: string, published: TournamentState): void;
}

/**
 * The public "follow live" link of this device's own (local) tournament: its read and write tokens, kept per
 * tournament in `LOCAL_STORE` under `setpoint.local.live.<analyticsId>`, and the calls that create and copy it. The
 * shell's sync reads the write token; the Ajustes card shows the link. A root service so both see the same link.
 */
@Injectable({ providedIn: 'root' })
export class LocalLiveLink {
  private readonly local = inject(LOCAL_STORE);
  private readonly auth = inject(AUTH);
  private readonly repository = inject(LOCAL_LIVE);
  private readonly urlState = inject(URL_STATE);
  private readonly analytics = inject(ANALYTICS);
  private readonly tournament = inject(CurrentTournament);
  private readonly random = inject(RANDOM);
  private hooks: LocalLiveHooks | null = null;

  private readonly link = signal('');
  private readonly busy = signal(false);
  private readonly message = signal<'copied' | null>(null);
  private readonly failure = signal<LiveLinkError | null>(null);
  private readToken = '';
  private token = '';
  private forAnalyticsId = '';

  readonly url = this.link.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly notice = this.message.asReadonly();
  readonly error = this.failure.asReadonly();

  /** Whether the cloud backend is set up for this deploy; the link needs it. */
  get configured(): boolean {
    return this.auth.configured;
  }

  connect(hooks: LocalLiveHooks): void {
    this.hooks = hooks;
  }

  /** The token that sends this device's scores to the link, or empty when the tournament has no link. */
  writeToken(): string {
    return this.token;
  }

  /** The link stored for this tournament, if any. Returns whether there is one (the shell then starts its sync). */
  restore(state: TournamentState): boolean {
    if (!state.analyticsId || state.hostingMode === 'shared') return false;
    try {
      const stored = this.local.getItem(`${LOCAL_LIVE_KEY}.${state.analyticsId}`);
      if (!stored) return false;
      const credentials = JSON.parse(stored) as { id?: string; readToken?: string; writeToken?: string };
      if (!credentials.id || !credentials.readToken || !credentials.writeToken) return false;
      this.readToken = credentials.readToken;
      this.token = credentials.writeToken;
      this.forAnalyticsId = state.analyticsId;
      this.link.set(this.urlState.liveUrl(credentials.readToken));
      return true;
    } catch {
      /* link remains unavailable if browser storage is blocked */
      return false;
    }
  }

  /** The id of the live tournament stored for this analytics id (the archive records it). */
  storedId(analyticsId?: string): string | undefined {
    if (!analyticsId) return undefined;
    try {
      const stored = this.local.getItem(`${LOCAL_LIVE_KEY}.${analyticsId}`);
      return stored ? (JSON.parse(stored) as { id?: string }).id : undefined;
    } catch {
      return undefined;
    }
  }

  /** Forgets the link of the tournament being left (its stored credentials go too). */
  clear(): void {
    try {
      if (this.forAnalyticsId) this.local.removeItem(`${LOCAL_LIVE_KEY}.${this.forAnalyticsId}`);
    } catch {
      /* sem armazenamento local */
    }
    this.readToken = '';
    this.token = '';
    this.forAnalyticsId = '';
    this.link.set('');
    this.message.set(null);
  }

  /** The analytics id the current link was made for (a different tournament drops it). */
  analyticsId(): string {
    return this.forAnalyticsId;
  }

  async createOrCopy(): Promise<void> {
    if (this.tournament.state().finishedAt) return;
    if (this.readToken) return this.copy();
    if (!this.auth.configured) {
      this.failure.set({ key: 'notConfigured' });
      return;
    }
    this.busy.set(true);
    this.failure.set(null);
    this.message.set(null);
    try {
      if (!this.tournament.state().analyticsId)
        this.tournament.update((state) => ({ ...state, analyticsId: this.random.uuid() }));
      const published: TournamentState = structuredClone(this.tournament.state());
      const analyticsId = published.analyticsId ?? '';
      const credentials = await this.repository.createLocalLiveTournament(published);
      this.readToken = credentials.readToken;
      this.token = credentials.writeToken;
      this.forAnalyticsId = analyticsId;
      this.link.set(this.urlState.liveUrl(credentials.readToken));
      this.local.setItem(`${LOCAL_LIVE_KEY}.${analyticsId}`, JSON.stringify(credentials));
      this.hooks?.published(analyticsId, published);
      this.analytics.capture('local_live_link_created');
      await this.copy();
    } catch (error) {
      this.failure.set({ key: 'createFailed', detail: error instanceof Error ? error.message : undefined });
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    const url = this.link();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.message.set('copied');
      this.failure.set(null);
      this.analytics.capture('local_live_link_copied');
    } catch {
      this.failure.set({ key: 'copyFailed' });
    }
  }
}
