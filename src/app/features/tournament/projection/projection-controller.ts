import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { PlayerStanding, TournamentState } from '../../../core/models';
import { PathCardService } from '../../../core/path-card.service';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import {
  type PathGoal,
  type PathProjection,
  type QualificationRow,
  QualificationService,
  type TrendPoint,
} from '../../../core/qualification.service';
import type { GoalPlace } from '../../../core/scenario-engine';
import { completedRounds } from '../../../domain/tournament-view/progress';
import { qualificationEnabled, qualificationSupported } from '../../../domain/tournament-view/qualification';

/** What the projection reads from the page that shows it. Functions, so both plain fields and signals can feed it. */
export interface ProjectionSource {
  state: () => TournamentState;
  standings: () => PlayerStanding[];
  /** Whose path is projected: the guest, or the athlete the host picked. Empty when there is nobody yet. */
  playerId: () => string;
  /** True for a guest: the projection is about the guest, and the seen marker is kept per guest. */
  isGuest: boolean;
  /** True while the projection is on screen. */
  viewing: () => boolean;
}

/**
 * The qualification projection ("Projeção" for the host, "Meu caminho" for a guest): the chosen goal, the what-if
 * results, the trend, the share image and the "new since you last looked" marker. Provide it in the component that
 * shows the projection and call `connect` once.
 */
@Injectable()
export class ProjectionController {
  private readonly qualification = inject(QualificationService);
  private readonly pathCard = inject(PathCardService);
  private readonly local = inject(LOCAL_STORE);
  private readonly analytics = inject(ANALYTICS);
  private source: ProjectionSource | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private trendTimer: ReturnType<typeof setTimeout> | null = null;
  /** Rounds completed when the viewer last looked at the projection, cached per storage key. */
  private seen: { key: string; rounds: number } | null = null;

  readonly targetPlace = signal<number>(3);
  readonly forced = signal<Record<string, 'A' | 'B'>>({});
  readonly trend = signal<TrendPoint[]>([]);
  readonly sharing = signal(false);
  readonly shareFailed = signal(false);
  readonly tipDismissed = signal(false);
  /** Touch has no hover tooltip: tapping the locked entry briefly explains when it unlocks. */
  readonly hintVisible = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.hintTimer !== null) clearTimeout(this.hintTimer);
      if (this.trendTimer !== null) clearTimeout(this.trendTimer);
    });
  }

  connect(source: ProjectionSource): void {
    this.source = source;
  }

  /** The projection exists for this tournament and viewer (it may still be locked until round 1 is done). */
  get configured(): boolean {
    const source = this.require();
    return qualificationSupported(source.state()) && (!source.isGuest || !!source.playerId());
  }
  get isGuest(): boolean {
    return this.require().isGuest;
  }
  /** The athlete whose path is shown. */
  get playerId(): string {
    return this.require().playerId();
  }
  get rows(): QualificationRow[] {
    const source = this.require();
    return qualificationEnabled(source.state()) ? this.qualification.compute(source.state(), source.standings()) : [];
  }
  /** Cached by the played results, so it is cheap to read from a template. */
  get path(): PathProjection | null {
    const source = this.require();
    const playerId = source.playerId();
    return qualificationEnabled(source.state()) && playerId
      ? this.qualification.projectPath(source.state(), source.standings(), playerId, this.forced())
      : null;
  }
  get available(): boolean {
    return qualificationEnabled(this.require().state()) && this.rows.length > 0;
  }
  /** New or updated since the viewer last opened it. */
  get hasNews(): boolean {
    const source = this.require();
    return this.available && !source.viewing() && completedRounds(source.state()) > this.loadSeen();
  }
  /** One-time nudge the first time the projection unlocks. */
  get showTip(): boolean {
    return this.available && !this.tipDismissed() && !this.require().viewing() && this.loadSeen() === 0;
  }
  /** The chosen goal with the real results only (no what-if), for the guest's nav badge and chance alerts. */
  get currentGoal(): PathGoal | null {
    const source = this.require();
    const playerId = source.playerId();
    if (!playerId || !qualificationEnabled(source.state())) return null;
    return (
      this.qualification.projectPath(source.state(), source.standings(), playerId)?.goals[
        this.targetPlace() as GoalPlace
      ] ?? null
    );
  }
  /** The guest's chance for the chosen goal: "✓" when clinched, "—" when out, else a percentage. */
  get chanceLabel(): string {
    if (!this.require().isGuest) return '';
    const goal = this.currentGoal;
    if (!goal) return '';
    return goal.status === 'clinched'
      ? '✓'
      : goal.status === 'eliminated'
        ? '—'
        : this.qualification.formatChance(goal.probability);
  }
  formatChance(probability: number): string {
    return this.qualification.formatChance(probability);
  }

  /** Records the opening and resets the transient state. False (and a hint) when it is still locked. */
  open(): boolean {
    if (!this.available) {
      this.flashHint();
      return false;
    }
    this.hintVisible.set(false);
    const path = this.path;
    const goal = path?.goals[this.targetPlace() as GoalPlace];
    this.analytics.capture('qualification_opened', {
      is_guest: this.require().isGuest,
      goal: this.targetPlace(),
      goal_status: goal?.status,
      calc_mode: path?.mode,
      open_matches: path?.openMatches,
    });
    this.tipDismissed.set(true);
    this.shareFailed.set(false);
    this.markSeen();
    this.refreshTrend();
    return true;
  }
  /** Leaving drops any simulated what-if results and records what the viewer saw. */
  leave(): void {
    this.forced.set({});
    this.markSeen();
  }
  dismissTip(): void {
    this.tipDismissed.set(true);
    this.hintVisible.set(false);
  }
  /**
   * The host picked another athlete: the what-if results belonged to the previous one. Always sets a new object:
   * the host's choice is a plain field, and this signal change is what re-renders the OnPush panel.
   */
  playerChanged(): void {
    this.forced.set({});
    this.refreshTrend();
  }
  setTargetPlace(place: number): void {
    this.targetPlace.set(place);
    this.analytics.capture('qualification_goal_changed', { goal: place });
  }
  toggleForced(event: { matchId: string; side: 'A' | 'B' }): void {
    const next = { ...this.forced() };
    const removing = next[event.matchId] === event.side;
    if (removing) delete next[event.matchId];
    else next[event.matchId] = event.side;
    this.forced.set(next);
    this.analytics.capture('qualification_whatif_used', {
      action: removing ? 'unset' : 'set',
      forced_count: Object.keys(next).length,
    });
  }
  clearForced(): void {
    this.forced.set({});
    this.analytics.capture('qualification_whatif_cleared');
  }

  /** Shares the path as an image, or downloads it where sharing files is not supported. */
  async share(): Promise<void> {
    const path = this.path;
    const goal = path?.goals[this.targetPlace() as GoalPlace];
    if (!path || !goal || this.sharing()) return;
    this.sharing.set(true);
    this.shareFailed.set(false);
    try {
      const blob = await this.pathCard.render(path, goal, this.require().state().name);
      const file = new File([blob], 'meu-caminho-setpoint.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Meu caminho no SETPOINT' });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      this.analytics.capture('qualification_path_shared', { goal: goal.goal, status: goal.status });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) this.shareFailed.set(true);
    } finally {
      this.sharing.set(false);
    }
  }

  /** The replay is the heavy part: it runs after the projection has painted. */
  refreshTrend(): void {
    if (this.trendTimer !== null) clearTimeout(this.trendTimer);
    this.trendTimer = setTimeout(() => {
      this.trendTimer = null;
      const source = this.require();
      const id = source.playerId();
      this.trend.set(
        id && qualificationEnabled(source.state()) ? this.qualification.pathHistory(source.state(), id) : [],
      );
    }, 40);
  }

  private flashHint(): void {
    this.hintVisible.set(true);
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      this.hintVisible.set(false);
      this.hintTimer = null;
    }, 3200);
  }

  /** Persisted per tournament and viewer; the key is stored data, so its shape must not change. */
  private seenKey(): string {
    const source = this.require();
    const state = source.state();
    return `setpoint.projection.seen.${state.sharedTournamentId ?? state.analyticsId ?? 'local'}.${source.isGuest ? source.playerId() : 'host'}`;
  }
  private loadSeen(): number {
    const key = this.seenKey();
    if (this.seen?.key !== key) {
      let rounds = 0;
      try {
        rounds = Number(this.local.getItem(key)) || 0;
      } catch {
        /* sem armazenamento */
      }
      this.seen = { key, rounds };
    }
    return this.seen.rounds;
  }
  private markSeen(): void {
    const key = this.seenKey();
    const rounds = completedRounds(this.require().state());
    this.seen = { key, rounds };
    try {
      this.local.setItem(key, String(rounds));
    } catch {
      /* indicador é opcional */
    }
  }

  private require(): ProjectionSource {
    if (!this.source) throw new Error('ProjectionController.connect() was not called');
    return this.source;
  }
}
