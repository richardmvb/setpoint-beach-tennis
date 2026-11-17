import { ChangeDetectionStrategy, Component, Input, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Player } from '../../../core/models';
import { GoalPlace } from '../../../core/scenario-engine';
import { PathGoal, PathMatch, PathProjection, QualificationRow, TrendPoint } from '../../../core/qualification.service';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';

const CIRCUMFERENCE = 2 * Math.PI * 52;

@Component({
  selector: 'app-qualification-stats',
  standalone: true,
  imports: [CommonModule, TranslocoDirective, PlayerAvatarComponent, ButtonComponent, CardComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <ng-container *transloco="let t; prefix: 'tournament.qualification'">
      <section uiCard class="qual-panel" aria-labelledby="qualTitle">
        <header class="qual-panel-header">
          <div>
            <span class="card-kicker">{{ isGuest() ? t('kickerGuest') : t('kickerHost') }}</span>
            <h2 id="qualTitle">{{ path?.playerName ?? t('title') }}</h2>
          </div>
        </header>

        @if (!isGuest() && rows.length) {
          <div class="qual-athletes" role="radiogroup" [attr.aria-label]="t('athlete')">
            @for (row of rows; track row.playerId) {
              <button
                type="button"
                role="radio"
                class="qual-athlete"
                [class.active]="row.playerId === targetPlayerId()"
                [attr.aria-checked]="row.playerId === targetPlayerId()"
                (click)="targetPlayerIdChange.emit(row.playerId)"
              >
                <app-player-avatar
                  [name]="row.name"
                  [photoDataUrl]="photoOf(row.playerId)"
                  variant="team-avatar"
                /><span>{{ row.name }}</span
                ><em>{{ row.position }}º</em>
              </button>
            }
          </div>
        }

        <div class="qual-goals" role="radiogroup" [attr.aria-label]="t('goal')">
          @for (option of goalOptions; track option) {
            <button
              type="button"
              role="radio"
              class="qual-goal"
              [class.active]="option.value === targetPlace()"
              [attr.aria-checked]="option.value === targetPlace()"
              (click)="targetPlaceChange.emit(option.value)"
            >
              <span>{{ goalLabel(option.value) }}</span><small>{{ goalBadge(option.value) }}</small>
            </button>
          }
        </div>

        @if (path && goal; as g) {
          <section class="qual-hero" [ngClass]="'is-' + g.status">
            <svg class="qual-gauge" viewBox="0 0 120 120" role="img" [attr.aria-label]="gaugeAria(g)">
              <circle class="gauge-track" cx="60" cy="60" r="52"></circle>
              <circle
                class="gauge-fill"
                cx="60"
                cy="60"
                r="52"
                [attr.stroke-dasharray]="circumference"
                [attr.stroke-dashoffset]="circumference * (1 - g.probability)"
                transform="rotate(-90 60 60)"
              ></circle>
              <text x="60" y="64" class="gauge-value">{{ gaugeText(g) }}</text>
              <text x="60" y="82" class="gauge-label">{{ gaugeLabel(g) }}</text>
            </svg>
            <div class="qual-hero-copy">
              <span class="qual-status">{{ statusLabel(g) }}</span>
              <h3>{{ g.headline }}</h3>
              <p>{{ g.detail }}</p>
              @if (g.tieNote) {
                <small class="qual-tie">{{ g.tieNote }}</small>
              }
              <div class="qual-meta">
                <span
                  >{{ path.position }}º {{ t('now') }} · {{ path.wins }}
                  {{ path.wins === 1 ? t('win') : t('wins') }}</span
                ><span>{{ t('likelyPlace') }} {{ path.expectedPlace | number: '1.1-1' }}º</span>
              </div>
            </div>
          </section>
          @if (path.forcedMatches.length) {
            <section class="qual-whatif-banner" aria-live="polite">
              <div>
                <b>{{ t('whatIf') }}</b><span
                  >{{
                    path.forcedMatches.length === 1
                      ? t('assumedOne')
                      : t('assumedMany', { count: path.forcedMatches.length })
                  }}
                  · {{ t('yourChanceNow') }} <strong>{{ chance(g.probability) }}</strong></span
                >
              </div>
              <ul>
                @for (m of path.forcedMatches; track m.id) {
                  <li>
                    <span>R{{ m.round }} · {{ m.forced === 'A' ? m.teamA : m.teamB }} {{ t('beats') }}</span
                    ><button
                      type="button"
                      (click)="force.emit({ matchId: m.id, side: m.forced! })"
                      [attr.aria-label]="t('undoResult')"
                    >
                      ✕
                    </button>
                  </li>
                }
              </ul>
              <button type="button" class="qual-link" (click)="clearForced.emit()">{{ t('clearScenario') }}</button>
            </section>
          }
          <section class="qual-section">
            <h3>{{ t('whereFinish') }}</h3>
            <div class="qual-bars" role="list">
              @for (bar of distribution; track $index; let i = $index) {
                <div
                  class="qual-bar"
                  role="listitem"
                  [class.in-goal]="i + 1 <= g.goal"
                  [attr.aria-label]="t('placeAria', { place: i + 1, chance: chance(bar) })"
                >
                  <span class="qual-bar-value">{{ chance(bar) }}</span>
                  <i [style.height.%]="barHeight(bar)"></i>
                  <b>{{ i + 1 }}º</b>
                </div>
              }
            </div>
            <small class="qual-hint">{{ t('goldHint') }}</small>
          </section>
          @if (trendDots.length > 1) {
            <section class="qual-section">
              <div class="qual-section-head">
                <h3>{{ t('trendTitle') }}</h3>
                @if (trendDelta !== null) {
                  <span class="qual-delta" [class.up]="trendDelta > 0" [class.down]="trendDelta < 0"
                    >{{ trendDelta > 0 ? '▲ +' : trendDelta < 0 ? '▼ ' : '' }}{{ trendDelta }}
                    {{ trendDelta === 1 || trendDelta === -1 ? t('pt') : t('pts') }}</span
                  >
                }
              </div>
              <svg
                class="qual-trend"
                viewBox="0 0 300 64"
                role="img"
                [attr.aria-label]="t('trendAria', { value: trendDots[trendDots.length - 1].text })"
              >
                <polyline [attr.points]="trendLine" class="trend-line"></polyline>
                @for (dot of trendDots; track $index; let last = $last) {
                  <g>
                    <circle
                      [attr.cx]="dot.x"
                      [attr.cy]="dot.y"
                      [attr.r]="last ? 5 : 3"
                      [class.trend-now]="last"
                    ></circle>
                  </g>
                }
              </svg>
              <div class="qual-trend-labels">
                <span>{{ trendDots[0].label }}</span><span
                  >{{ trendDots[trendDots.length - 1].label }} · {{ trendDots[trendDots.length - 1].text }}</span
                >
              </div>
            </section>
          }
          @if (g.myMatches.length) {
            <section class="qual-section">
              <h3>{{ t('nextMatches') }}</h3>
              @for (m of g.myMatches; track m.id) {
                <article class="qual-match">
                  <small>{{ t('round') }} {{ m.round }}</small>
                  <b>{{ m.teamA }} <span>×</span> {{ m.teamB }}</b>
                  <div class="qual-impact">
                    <span class="win"
                      >{{ t('ifWin') }} <strong>{{ chance(myWin(m)) }}</strong></span
                    ><span class="lose"
                      >{{ t('ifLose') }} <strong>{{ chance(myLoss(m)) }}</strong></span
                    >
                  </div>
                  <div class="qual-whatif">
                    <button type="button" (click)="force.emit({ matchId: m.id, side: m.mySide! })">
                      {{ t('whatIfWin') }}</button><button
                      type="button"
                      (click)="force.emit({ matchId: m.id, side: m.mySide === 'A' ? 'B' : 'A' })"
                    >
                      {{ t('whatIfLose') }}
                    </button>
                  </div>
                </article>
              }
            </section>
          }
          @if (g.watchMatches.length) {
            <section class="qual-section">
              <h3>{{ t('othersTitle') }}</h3>
              @for (m of g.watchMatches; track m.id) {
                <article class="qual-match">
                  <small
                    >{{ t('round') }} {{ m.round }} · {{ t('moves') }} {{ points(m.swing) }}
                    {{ points(m.swing) === 1 ? t('ptUpper') : t('ptsUpper') }}</small
                  >
                  <div class="qual-versus">
                    <button
                      type="button"
                      class="qual-side"
                      [class.best]="m.better === 'A'"
                      (click)="force.emit({ matchId: m.id, side: 'A' })"
                    >
                      <b>{{ m.teamA }}</b><span>{{ t('winning') }} {{ chance(m.ifAWins) }}</span>
                    </button>
                    <em>×</em>
                    <button
                      type="button"
                      class="qual-side"
                      [class.best]="m.better === 'B'"
                      (click)="force.emit({ matchId: m.id, side: 'B' })"
                    >
                      <b>{{ m.teamB }}</b><span>{{ t('winning') }} {{ chance(m.ifBWins) }}</span>
                    </button>
                  </div>
                </article>
              }
              <small class="qual-hint">{{ t('tapHint') }}</small>
            </section>
          }
          @if (g.rivals.length) {
            <section class="qual-section">
              <h3>{{ t('follow') }}</h3>
              @for (rival of g.rivals; track rival.playerId) {
                <article class="qual-rival">
                  <span class="qual-rank">{{ rival.position }}º</span>
                  <div>
                    <b>{{ rival.name }}</b>
                    <p>
                      {{ t('rivalLead') }}
                      <strong>+{{ rival.gainPerLoss }} {{ rival.gainPerLoss === 1 ? t('pt') : t('pts') }}</strong>
                      {{ t('rivalTail') }}
                    </p>
                  </div>
                </article>
              }
            </section>
          }
          @if (g.byMyWins.length > 1) {
            <section class="qual-section">
              <h3>{{ t('winsTitle') }}</h3>
              <div class="qual-wins">
                @for (row of g.byMyWins; track row.wins) {
                  <div>
                    <span>{{ t('winsOf', { wins: row.wins, total: path.remainingMatches }) }}</span>
                    <div class="qual-wins-bar"><i [style.width.%]="row.probability * 100"></i></div>
                    <strong>{{ chance(row.probability) }}</strong>
                  </div>
                }
              </div>
            </section>
          }
          <footer class="qual-foot">
            <button uiButton variant="primary" (click)="share.emit()" [disabled]="sharing()">
              {{ sharing() ? t('preparing') : t('shareMine') }}
            </button>
            @if (shareError) {
              <p class="shared-error" role="alert">{{ shareError }}</p>
            }
            <p class="qual-method-note">{{ methodNote }}</p>
          </footer>
        }
        @if (!path) {
          <p class="muted">{{ t('noData') }}</p>
        }
      </section>
    </ng-container>
  `,
})
export class QualificationStatsComponent {
  private readonly transloco = inject(TranslocoService);
  readonly circumference = CIRCUMFERENCE;
  readonly goalOptions: { value: GoalPlace }[] = [{ value: 1 }, { value: 2 }, { value: 3 }];
  @Input() rows: QualificationRow[] = [];
  readonly players = input<Player[]>([]);
  @Input() path: PathProjection | null = null;
  readonly trend = input<TrendPoint[]>([]);
  readonly targetPlayerId = input('');
  readonly targetPlace = input(3);
  readonly isGuest = input(false);
  readonly sharing = input(false);
  @Input() shareError = '';
  readonly targetPlayerIdChange = output<string>();
  readonly targetPlaceChange = output<number>();
  readonly force = output<{
    matchId: string;
    side: 'A' | 'B';
  }>();
  readonly clearForced = output<void>();
  readonly share = output<void>();

  get goal(): PathGoal | null {
    return this.path?.goals[this.targetPlace() as GoalPlace] ?? null;
  }
  get distribution(): number[] {
    return (this.path?.placeDistribution ?? []).slice(0, 8);
  }
  get methodNote(): string {
    const mode =
      this.path?.mode === 'exact'
        ? this.transloco.translate('qualification.methodExact', {}, 'tournament/pt-BR')
        : this.transloco.translate('qualification.methodSimulated', {}, 'tournament/pt-BR');
    return `${mode} ${this.transloco.translate('qualification.methodTail', {}, 'tournament/pt-BR')}`;
  }

  goalLabel(place: GoalPlace): string {
    return place === 1
      ? this.transloco.translate('qualification.champion', {}, 'tournament/pt-BR')
      : place === 2
        ? this.transloco.translate('qualification.top2', {}, 'tournament/pt-BR')
        : this.transloco.translate('qualification.top3', {}, 'tournament/pt-BR');
  }

  photoOf(playerId: string): string | undefined {
    return this.players().find((player) => player.id === playerId)?.photoDataUrl;
  }
  goalBadge(place: GoalPlace): string {
    const goal = this.path?.goals[place];
    if (!goal) return '';
    return goal.status === 'clinched' ? '✓' : goal.status === 'eliminated' ? '—' : this.chance(goal.probability);
  }
  chance(probability: number): string {
    if (probability <= 0) return '0%';
    if (probability < 0.01) return '<1%';
    if (probability > 0.99 && probability < 1) return '>99%';
    return `${Math.round(probability * 100)}%`;
  }
  points(swing: number): number {
    return Math.max(1, Math.round(swing * 100));
  }
  barHeight(probability: number): number {
    const max = Math.max(0.01, ...this.distribution);
    return Math.max(4, (probability / max) * 100);
  }
  myWin(match: PathMatch): number {
    return match.mySide === 'A' ? match.ifAWins : match.ifBWins;
  }
  myLoss(match: PathMatch): number {
    return match.mySide === 'A' ? match.ifBWins : match.ifAWins;
  }
  gaugeText(goal: PathGoal): string {
    return goal.status === 'clinched' ? '✓' : goal.status === 'eliminated' ? '—' : this.chance(goal.probability);
  }
  gaugeLabel(goal: PathGoal): string {
    return goal.status === 'clinched'
      ? this.transloco.translate('qualification.gauge.clinched', {}, 'tournament/pt-BR')
      : goal.status === 'eliminated'
        ? this.transloco.translate('qualification.gauge.eliminated', {}, 'tournament/pt-BR')
        : this.transloco.translate('qualification.gauge.chance', {}, 'tournament/pt-BR');
  }
  statusLabel(goal: PathGoal): string {
    return goal.status === 'clinched'
      ? this.transloco.translate('qualification.status.clinched', {}, 'tournament/pt-BR')
      : goal.status === 'eliminated'
        ? this.transloco.translate('qualification.status.eliminated', {}, 'tournament/pt-BR')
        : this.transloco.translate('qualification.status.contending', {}, 'tournament/pt-BR');
  }
  gaugeAria(goal: PathGoal): string {
    return `${this.statusLabel(goal)}: ${goal.headline}`;
  }

  get trendDots(): { x: number; y: number; label: string; text: string }[] {
    const points = this.trend();
    if (points.length < 2) return [];
    return points.map((point, index) => {
      const value = point.probability[this.targetPlace() as GoalPlace];
      return {
        x: 8 + (284 * index) / (points.length - 1),
        y: 58 - value * 52,
        label: point.label,
        text: this.chance(value),
      };
    });
  }
  get trendLine(): string {
    return this.trendDots.map((dot) => `${dot.x},${dot.y}`).join(' ');
  }
  get trendDelta(): number | null {
    const points = this.trend();
    if (points.length < 2) return null;
    const last = points[points.length - 1].probability[this.targetPlace() as GoalPlace];
    const previous = points[points.length - 2].probability[this.targetPlace() as GoalPlace];
    return Math.round((last - previous) * 100);
  }
}
