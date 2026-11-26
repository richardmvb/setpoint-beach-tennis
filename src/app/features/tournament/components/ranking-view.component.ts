import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { Player, PlayerStanding, Round } from '../../../core/models';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { GenderIconComponent } from '../../gender-icon.component';
import { CardComponent } from '@ui/card/card.component';
import { RankingHint } from '../../../core/ranking-hint';
import { RankingCriteriaComponent } from './ranking-criteria.component';

@Component({
  selector: 'app-ranking-view',
  standalone: true,
  imports: [
    CommonModule,
    PlayerAvatarComponent,
    GenderIconComponent,
    CardComponent,
    TranslocoDirective,
    RankingCriteriaComponent,
  ],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ranking-view.component.css',
  template: `
    <ng-container *transloco="let t; prefix: 'tournament.ranking'">
      <app-ranking-criteria (helpRequested)="helpRequested.emit()" />
      @if (hasSchedule() && !hint.seen()) {
        <p class="ranking-hint"><span aria-hidden="true">›</span> {{ t('openHint') }}</p>
      }
      <span class="visually-hidden" id="ranking-open-description">{{ t('openDescription') }}</span>
      @if (showGenderRankings()) {
        <section class="gender-ranking-grid">
          <ng-container
            *ngTemplateOutlet="
              genderRanking;
              context: { title: t('maleTitle'), icon: 'male', rows: maleStandings(), limit: genderRankingLimit() }
            "
          />
          <ng-container
            *ngTemplateOutlet="
              genderRanking;
              context: { title: t('femaleTitle'), icon: 'female', rows: femaleStandings(), limit: genderRankingLimit() }
            "
          />
        </section>
      }
      <ng-template #genderRanking let-title="title" let-icon="icon" let-rows="rows" let-limit="limit"
        ><article uiCard class="gender-ranking-card">
          <div class="card-title-row">
            <div>
              <span class="card-kicker">{{ title }}</span>
              <h2>{{ t('top', { limit: limit }) }}</h2>
            </div>
            <app-gender-icon [gender]="icon" />
          </div>
          <div class="table-scroll">
            <table class="leaderboard">
              <thead>
                <tr>
                  <th>{{ t('position') }}</th>
                  <th>{{ t('player') }}</th>
                  <th class="numeric">{{ t('wins') }}</th>
                  <th class="numeric">{{ t('matches') }}</th>
                  <th class="numeric">{{ t('gamesForShort') }}</th>
                  <th class="numeric">{{ t('against') }}</th>
                  <th class="numeric">{{ t('balance') }}</th>
                  <th class="numeric">{{ t('rests') }}</th>
                  <th class="row-open">
                    <span class="visually-hidden">{{ t('open') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of rows.slice(0, limit); track row.playerId; let i = $index) {
                  <tr
                    [class.gender-cut]="i === limit - 1"
                    [class.rank-gold]="i === 0"
                    [class.rank-silver]="i === 1"
                    [class.rank-bronze]="i === 2"
                  >
                    <td>
                      <span
                        class="rank-number"
                        [class.top-three]="i < 3"
                        [class.medal]="i < 3"
                        [attr.data-place]="i + 1"
                        >{{ (i + 1).toString().padStart(2, '0') }}</span
                      >
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ranking-player-cell ranking-player-button"
                        aria-describedby="ranking-open-description"
                        (click)="select(row.playerId)"
                      >
                        <app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)" /><app-gender-icon
                          [gender]="icon"
                        /><span class="ranking-player-name"
                          ><b>{{ row.name }}</b
                          ><small class="table-sub">{{
                            t('gamesOf', { played: row.matchesPlayed, total: scheduledMatches(row.playerId) })
                          }}</small></span
                        >
                      </button>
                    </td>
                    <td class="numeric">
                      <b>{{ row.setsWon }}</b>
                    </td>
                    <td class="numeric">{{ row.matchesPlayed }} / {{ scheduledMatches(row.playerId) }}</td>
                    <td class="numeric">{{ row.gamesFor }}</td>
                    <td class="numeric">{{ row.gamesAgainst }}</td>
                    <td class="numeric">
                      <b
                        class="balance-chip"
                        [class.positive]="row.gameBalance > 0"
                        [class.negative]="row.gameBalance < 0"
                        >{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b
                      >
                    </td>
                    <td class="numeric">{{ row.rests }}</td>
                    <td class="row-open" aria-hidden="true">›</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </article></ng-template
      >
      <article uiCard class="full-card">
        <div class="card-title-row">
          <div>
            <span class="card-kicker">{{ t('overall') }}</span>
            <h2>{{ t('individual') }}</h2>
          </div>
          <span class="mini-tag">{{ t('athletesCount', { count: standings().length }) }}</span>
        </div>
        @if (!hasSchedule()) {
          <div class="empty-state">
            <span>↗</span><b>{{ t('emptyTitle') }}</b
            ><small>{{ t('emptyHint') }}</small>
          </div>
        }
        @if (hasSchedule()) {
          <div class="table-scroll">
            <table class="leaderboard">
              <thead>
                <tr>
                  <th>{{ t('position') }}</th>
                  <th>{{ t('player') }}</th>
                  <th class="numeric">{{ t('wins') }}</th>
                  <th class="numeric">{{ t('matches') }}</th>
                  <th class="numeric">{{ t('gamesFor') }}</th>
                  <th class="numeric">{{ t('against') }}</th>
                  <th class="numeric">{{ t('balance') }}</th>
                  <th class="numeric">{{ t('rests') }}</th>
                  <th class="row-open">
                    <span class="visually-hidden">{{ t('open') }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                @for (row of standings(); track row.playerId; let i = $index) {
                  <tr
                    [class.rank-gold]="i === 0"
                    [class.rank-silver]="i === 1"
                    [class.rank-bronze]="i === 2"
                    [class.me-row]="!!highlightId() && row.playerId === highlightId()"
                  >
                    <td>
                      <span
                        class="rank-number"
                        [class.top-three]="i < 3"
                        [class.medal]="i < 3"
                        [attr.data-place]="i + 1"
                        >{{ (i + 1).toString().padStart(2, '0') }}</span
                      >
                    </td>
                    <td>
                      <button
                        type="button"
                        class="ranking-player-cell ranking-player-button"
                        aria-describedby="ranking-open-description"
                        (click)="select(row.playerId)"
                      >
                        <app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)" />
                        @if (genderOf(row.playerId)) {
                          <app-gender-icon [gender]="genderOf(row.playerId)!" />
                        }
                        <span class="ranking-player-name"
                          ><span class="ranking-name-line"
                            ><b>{{ row.name }}</b>
                            @if (moveOf(row.playerId); as move) {
                              <i
                                role="img"
                                class="move-chip"
                                [class.up]="move > 0"
                                [class.down]="move < 0"
                                [attr.aria-label]="
                                  move > 0 ? t('movedUp', { count: move }) : t('movedDown', { count: -move })
                                "
                                >{{ move > 0 ? '▲' : '▼' }}{{ move > 0 ? move : -move }}</i
                              >
                            }
                            @if (i === 0 && row.setsWon > 0) {
                              <em class="row-tag leader-tag">{{ t('leader') }}</em>
                            }
                            @if (!!highlightId() && row.playerId === highlightId()) {
                              <em class="row-tag me-tag">{{ t('you') }}</em>
                            }</span
                          ><small class="table-sub">{{
                            t('gamesOf', { played: row.matchesPlayed, total: scheduledMatches(row.playerId) })
                          }}</small
                          ><span class="form-bar" aria-hidden="true"><i [style.width.%]="barPercent(row)"></i></span
                        ></span>
                      </button>
                    </td>
                    <td class="numeric">
                      <b>{{ row.setsWon }}</b>
                    </td>
                    <td class="numeric">{{ row.matchesPlayed }} / {{ scheduledMatches(row.playerId) }}</td>
                    <td class="numeric">{{ row.gamesFor }}</td>
                    <td class="numeric">{{ row.gamesAgainst }}</td>
                    <td class="numeric">
                      <b
                        class="balance-chip"
                        [class.positive]="row.gameBalance > 0"
                        [class.negative]="row.gameBalance < 0"
                        >{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b
                      >
                    </td>
                    <td class="numeric">{{ row.rests }}</td>
                    <td class="row-open" aria-hidden="true">›</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </article>
    </ng-container>
  `,
})
export class RankingViewComponent implements OnChanges, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  protected readonly hint = inject(RankingHint);
  private lastRanks = new Map<string, number>();
  private movementTimer: ReturnType<typeof setTimeout> | null = null;
  private movement = new Map<string, number>();
  readonly standings = input<PlayerStanding[]>([]);
  readonly players = input<Player[]>([]);
  readonly rounds = input<Round[]>([]);
  readonly maleStandings = input<PlayerStanding[]>([]);
  readonly femaleStandings = input<PlayerStanding[]>([]);
  readonly showGenderRankings = input(false);
  readonly genderRankingLimit = input(8);
  readonly hasSchedule = input(false);
  readonly highlightId = input('');
  readonly playerSelected = output<string>();
  /** "Como funciona" was asked for: the opener shows the help dialog with its tournament. */
  readonly helpRequested = output();

  protected select(playerId: string): void {
    this.hint.markSeen();
    this.playerSelected.emit(playerId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['standings']) return;
    const ranks = new Map(this.standings().map((row, index) => [row.playerId, index] as const));
    if (this.lastRanks.size) {
      const moves = new Map<string, number>();
      ranks.forEach((rank, id) => {
        const previous = this.lastRanks.get(id);
        if (previous !== undefined && previous !== rank) moves.set(id, previous - rank);
      });
      if (moves.size) {
        this.movement = moves;
        if (this.movementTimer) clearTimeout(this.movementTimer);
        // Arrows are a live cue, not state: they fade after a while.
        this.movementTimer = setTimeout(() => {
          this.movement = new Map();
          this.changeDetector.markForCheck();
        }, 30000);
      }
    }
    this.lastRanks = ranks;
  }

  ngOnDestroy(): void {
    if (this.movementTimer) clearTimeout(this.movementTimer);
  }

  moveOf(playerId: string): number {
    return this.movement.get(playerId) ?? 0;
  }
  barPercent(row: PlayerStanding): number {
    const best = this.standings().reduce((max, item) => Math.max(max, item.setsWon), 0);
    return best ? Math.round((row.setsWon / best) * 100) : 0;
  }

  scheduledMatches(playerId: string): number {
    return this.rounds().reduce(
      (total, round) =>
        total +
        round.matches.filter((match) => match.teamA.includes(playerId) || match.teamB.includes(playerId)).length,
      0,
    );
  }
  nameOf(playerId: string): string {
    return this.players().find((player) => player.id === playerId)?.name ?? '';
  }
  photoOf(playerId: string): string {
    return this.players().find((player) => player.id === playerId)?.photoDataUrl ?? '';
  }
  genderOf(playerId: string) {
    return this.players().find((player) => player.id === playerId)?.gender;
  }
}
