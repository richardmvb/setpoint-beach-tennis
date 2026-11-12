import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player } from '../core/models';
import { GoalPlace } from '../core/scenario-engine';
import { PathGoal, PathMatch, PathProjection, QualificationRow, TrendPoint } from '../core/qualification.service';
import { PlayerAvatarComponent } from './player-avatar.component';

const CIRCUMFERENCE = 2 * Math.PI * 52;

@Component({
  selector: 'app-qualification-stats',
  standalone: true,
  imports: [CommonModule, PlayerAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <section class="qual-panel surface-card" aria-labelledby="qualTitle">
      <header class="qual-panel-header">
        <div>
          <span class="card-kicker">{{ isGuest ? 'SEU CAMINHO' : 'CAMINHO DE' }}</span>
          <h2 id="qualTitle">{{ path?.playerName ?? 'Projeção' }}</h2>
        </div>
      </header>

      @if (!isGuest && rows.length) {
        <div class="qual-athletes" role="radiogroup" aria-label="Atleta">
          @for (row of rows; track row) {
            <button
              type="button"
              role="radio"
              class="qual-athlete"
              [class.active]="row.playerId === targetPlayerId"
              [attr.aria-checked]="row.playerId === targetPlayerId"
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

      <div class="qual-goals" role="radiogroup" aria-label="Objetivo">
        @for (option of goalOptions; track option) {
          <button
            type="button"
            role="radio"
            class="qual-goal"
            [class.active]="option.value === targetPlace"
            [attr.aria-checked]="option.value === targetPlace"
            (click)="targetPlaceChange.emit(option.value)"
          >
            <span>{{ option.label }}</span><small>{{ goalBadge(option.value) }}</small>
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
              <span>{{ path.position }}º agora · {{ path.wins }} {{ path.wins === 1 ? 'vitória' : 'vitórias' }}</span
              ><span>Colocação provável: {{ path.expectedPlace | number: '1.1-1' }}º</span>
            </div>
          </div>
        </section>
        @if (path.forcedMatches.length) {
          <section class="qual-whatif-banner" aria-live="polite">
            <div>
              <b>Cenário simulado</b
              ><span
                >{{
                  path.forcedMatches.length === 1
                    ? '1 resultado assumido'
                    : path.forcedMatches.length + ' resultados assumidos'
                }}
                · sua chance agora: <strong>{{ chance(g.probability) }}</strong></span
              >
            </div>
            <ul>
              @for (m of path.forcedMatches; track m) {
                <li>
                  <span>R{{ m.round }} · {{ m.forced === 'A' ? m.teamA : m.teamB }} vence</span
                  ><button
                    type="button"
                    (click)="force.emit({ matchId: m.id, side: m.forced! })"
                    aria-label="Desfazer este resultado"
                  >
                    ✕
                  </button>
                </li>
              }
            </ul>
            <button type="button" class="qual-link" (click)="clearForced.emit()">Limpar cenário</button>
          </section>
        }
        <section class="qual-section">
          <h3>Onde você pode terminar</h3>
          <div class="qual-bars" role="list">
            @for (bar of distribution; track bar; let i = $index) {
              <div
                class="qual-bar"
                role="listitem"
                [class.in-goal]="i + 1 <= g.goal"
                [attr.aria-label]="i + 1 + 'º lugar: ' + chance(bar)"
              >
                <span class="qual-bar-value">{{ chance(bar) }}</span>
                <i [style.height.%]="barHeight(bar)"></i>
                <b>{{ i + 1 }}º</b>
              </div>
            }
          </div>
          <small class="qual-hint">Em dourado, as colocações que cumprem o objetivo.</small>
        </section>
        @if (trendDots.length > 1) {
          <section class="qual-section">
            <div class="qual-section-head">
              <h3>Sua chance ao longo do torneio</h3>
              @if (trendDelta !== null) {
                <span class="qual-delta" [class.up]="trendDelta > 0" [class.down]="trendDelta < 0"
                  >{{ trendDelta > 0 ? '▲ +' : trendDelta < 0 ? '▼ ' : '' }}{{ trendDelta }}
                  {{ trendDelta === 1 || trendDelta === -1 ? 'pt' : 'pts' }}</span
                >
              }
            </div>
            <svg
              class="qual-trend"
              viewBox="0 0 300 64"
              role="img"
              [attr.aria-label]="'Chance de ' + trendDots[trendDots.length - 1].text + ' agora'"
            >
              <polyline [attr.points]="trendLine" class="trend-line"></polyline>
              @for (dot of trendDots; track dot; let last = $last) {
                <g>
                  <circle [attr.cx]="dot.x" [attr.cy]="dot.y" [attr.r]="last ? 5 : 3" [class.trend-now]="last"></circle>
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
            <h3>Seus próximos jogos</h3>
            @for (m of g.myMatches; track m) {
              <article class="qual-match">
                <small>RODADA {{ m.round }}</small>
                <b>{{ m.teamA }} <span>×</span> {{ m.teamB }}</b>
                <div class="qual-impact">
                  <span class="win"
                    >Vencendo <strong>{{ chance(myWin(m)) }}</strong></span
                  ><span class="lose"
                    >Perdendo <strong>{{ chance(myLoss(m)) }}</strong></span
                  >
                </div>
                <div class="qual-whatif">
                  <button type="button" (click)="force.emit({ matchId: m.id, side: m.mySide! })">E se eu vencer?</button
                  ><button type="button" (click)="force.emit({ matchId: m.id, side: m.mySide === 'A' ? 'B' : 'A' })">
                    E se eu perder?
                  </button>
                </div>
              </article>
            }
          </section>
        }
        @if (g.watchMatches.length) {
          <section class="qual-section">
            <h3>Jogos dos outros que mexem na sua chance</h3>
            @for (m of g.watchMatches; track m) {
              <article class="qual-match">
                <small
                  >RODADA {{ m.round }} · MOVE {{ points(m.swing) }} {{ points(m.swing) === 1 ? 'PT' : 'PTS' }}</small
                >
                <div class="qual-versus">
                  <button
                    type="button"
                    class="qual-side"
                    [class.best]="m.better === 'A'"
                    (click)="force.emit({ matchId: m.id, side: 'A' })"
                  >
                    <b>{{ m.teamA }}</b><span>vencendo: {{ chance(m.ifAWins) }}</span>
                  </button>
                  <em>×</em>
                  <button
                    type="button"
                    class="qual-side"
                    [class.best]="m.better === 'B'"
                    (click)="force.emit({ matchId: m.id, side: 'B' })"
                  >
                    <b>{{ m.teamB }}</b><span>vencendo: {{ chance(m.ifBWins) }}</span>
                  </button>
                </div>
              </article>
            }
            <small class="qual-hint">Toque em uma dupla para simular a vitória dela.</small>
          </section>
        }
        @if (g.rivals.length) {
          <section class="qual-section">
            <h3>Quem acompanhar</h3>
            @for (rival of g.rivals; track rival) {
              <article class="qual-rival">
                <span class="qual-rank">{{ rival.position }}º</span>
                <div>
                  <b>{{ rival.name }}</b>
                  <p>
                    Cada derrota nos jogos que faltam vale
                    <strong>+{{ rival.gainPerLoss }} {{ rival.gainPerLoss === 1 ? 'pt' : 'pts' }}</strong> na sua
                    chance.
                  </p>
                </div>
              </article>
            }
          </section>
        }
        @if (g.byMyWins.length > 1) {
          <section class="qual-section">
            <h3>Quanto cada vitória vale</h3>
            <div class="qual-wins">
              @for (row of g.byMyWins; track row) {
                <div>
                  <span>{{ row.wins }} de {{ path.remainingMatches }}</span>
                  <div class="qual-wins-bar"><i [style.width.%]="row.probability * 100"></i></div>
                  <strong>{{ chance(row.probability) }}</strong>
                </div>
              }
            </div>
          </section>
        }
        <footer class="qual-foot">
          <button type="button" class="button primary" (click)="share.emit()" [disabled]="sharing">
            {{ sharing ? 'Preparando imagem…' : 'Compartilhar meu caminho' }}
          </button>
          @if (shareError) {
            <p class="shared-error" role="alert">{{ shareError }}</p>
          }
          <p class="qual-method-note">{{ methodNote }}</p>
        </footer>
      }
      @if (!path) {
        <p class="muted">Não há dados suficientes para esta projeção.</p>
      }
    </section>
  `,
})
export class QualificationStatsComponent {
  readonly circumference = CIRCUMFERENCE;
  readonly goalOptions: { value: GoalPlace; label: string }[] = [
    { value: 1, label: 'Campeão' },
    { value: 2, label: 'Top 2' },
    { value: 3, label: 'Top 3' },
  ];
  @Input() rows: QualificationRow[] = [];
  @Input() players: Player[] = [];
  @Input() path: PathProjection | null = null;
  @Input() trend: TrendPoint[] = [];
  @Input() targetPlayerId = '';
  @Input() targetPlace = 3;
  @Input() isGuest = false;
  @Input() sharing = false;
  @Input() shareError = '';
  @Output() targetPlayerIdChange = new EventEmitter<string>();
  @Output() targetPlaceChange = new EventEmitter<number>();
  @Output() force = new EventEmitter<{ matchId: string; side: 'A' | 'B' }>();
  @Output() clearForced = new EventEmitter<void>();
  @Output() share = new EventEmitter<void>();

  get goal(): PathGoal | null {
    return this.path?.goals[this.targetPlace as GoalPlace] ?? null;
  }
  get distribution(): number[] {
    return (this.path?.placeDistribution ?? []).slice(0, 8);
  }
  get methodNote(): string {
    const mode =
      this.path?.mode === 'exact'
        ? 'Cálculo exato de todos os cenários possíveis.'
        : 'Estimativa por simulação; "garantido" e "eliminado" só aparecem quando são matematicamente certos.';
    return `${mode} Todos os jogos restantes são considerados equilibrados. Empates em vitórias são decididos pelo saldo de games e depois pelo confronto direto.`;
  }

  photoOf(playerId: string): string | undefined {
    return this.players.find((player) => player.id === playerId)?.photoDataUrl;
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
    return goal.status === 'clinched' ? 'garantido' : goal.status === 'eliminated' ? 'eliminado' : 'de chance';
  }
  statusLabel(goal: PathGoal): string {
    return goal.status === 'clinched' ? 'GARANTIDO' : goal.status === 'eliminated' ? 'FORA DA DISPUTA' : 'NA BRIGA';
  }
  gaugeAria(goal: PathGoal): string {
    return `${this.statusLabel(goal)}: ${goal.headline}`;
  }

  get trendDots(): { x: number; y: number; label: string; text: string }[] {
    const points = this.trend;
    if (points.length < 2) return [];
    return points.map((point, index) => {
      const value = point.probability[this.targetPlace as GoalPlace];
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
    const points = this.trend;
    if (points.length < 2) return null;
    const last = points[points.length - 1].probability[this.targetPlace as GoalPlace];
    const previous = points[points.length - 2].probability[this.targetPlace as GoalPlace];
    return Math.round((last - previous) * 100);
  }
}
