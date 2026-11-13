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
import { Player, PlayerStanding, Round } from '../core/models';
import { PlayerAvatarComponent } from './player-avatar.component';
import { GenderIconComponent } from './gender-icon.component';
import { CardComponent } from '@ui/card/card.component';
import type { GroupStandingEntry, GroupStandingTable } from '../domain/tournament-view/group-tables';

@Component({
  selector: 'app-ranking-view',
  standalone: true,
  imports: [CommonModule, PlayerAvatarComponent, GenderIconComponent, CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    @for (group of groupTables(); track group.id) {
      <article uiCard class="full-card group-ranking-card">
        <div class="card-title-row">
          <div>
            <span class="card-kicker">{{ group.name }}</span>
            <h2>Classificação</h2>
          </div>
          <span class="mini-tag">{{ fixedPairsMode() ? 'Duplas' : 'Atletas' }}</span>
        </div>
        <div class="table-scroll">
          <table class="leaderboard">
            <thead>
              <tr>
                <th>POS.</th>
                <th>{{ fixedPairsMode() ? 'DUPLA' : 'JOGADOR' }}</th>
                <th class="numeric">VIT.</th>
                <th class="numeric">PRÓ</th>
                <th class="numeric">SALDO</th>
                <th class="numeric">JOGOS</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of group.entries; track entry.playerIds.join('+'); let i = $index) {
                <tr
                  [class.me-row]="isMine(entry)"
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
                      >{{ i + 1 }}</span
                    >
                  </td>
                  <td>
                    <span class="ranking-player-cell">
                      @for (id of entry.playerIds; track id) {
                        <app-player-avatar [name]="nameOf(id)" [photoDataUrl]="photoOf(id)" />
                      }
                      <b>{{ entry.label }}</b>
                      @if (isMine(entry)) {
                        <em class="row-tag me-tag">VOCÊ</em>
                      }
                    </span>
                  </td>
                  <td class="numeric">
                    <b>{{ entry.setsWon }}</b>
                  </td>
                  <td class="numeric">{{ entry.gamesFor }}</td>
                  <td class="numeric">
                    <b
                      class="balance-chip"
                      [class.positive]="entry.gameBalance > 0"
                      [class.negative]="entry.gameBalance < 0"
                      >{{ entry.gameBalance > 0 ? '+' : '' }}{{ entry.gameBalance }}</b
                    >
                  </td>
                  <td class="numeric">{{ entry.matchesPlayed }} / {{ scheduledMatches(entry.playerIds[0]) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </article>
    }
    @if (showGenderRankings()) {
      <section class="gender-ranking-grid">
        <ng-container
          *ngTemplateOutlet="
            genderRanking;
            context: { title: 'RANKING MASCULINO', icon: 'male', rows: maleStandings(), limit: genderRankingLimit() }
          "
        />
        <ng-container
          *ngTemplateOutlet="
            genderRanking;
            context: { title: 'RANKING FEMININO', icon: 'female', rows: femaleStandings(), limit: genderRankingLimit() }
          "
        />
      </section>
    }
    <ng-template #genderRanking let-title="title" let-icon="icon" let-rows="rows" let-limit="limit"
      ><article uiCard class="gender-ranking-card">
        <div class="card-title-row">
          <div>
            <span class="card-kicker">{{ title }}</span>
            <h2>Top {{ limit }} classificados</h2>
          </div>
          <app-gender-icon [gender]="icon" />
        </div>
        <div class="table-scroll">
          <table class="leaderboard">
            <thead>
              <tr>
                <th>POS.</th>
                <th>JOGADOR</th>
                <th class="numeric">WINS</th>
                <th class="numeric">JOGOS</th>
                <th class="numeric">PRÓ</th>
                <th class="numeric">CONTRA</th>
                <th class="numeric">SALDO</th>
                <th class="numeric">DESC.</th>
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
                      (click)="playerSelected.emit(row.playerId)"
                    >
                      <app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)" /><app-gender-icon
                        [gender]="icon"
                      /><span class="ranking-player-name"
                        ><b>{{ row.name }}</b
                        ><small class="table-sub"
                          >{{ row.matchesPlayed }} de {{ scheduledMatches(row.playerId) }} jogos</small
                        ></span
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
          <span class="card-kicker">CLASSIFICAÇÃO GERAL</span>
          <h2>Ranking individual</h2>
        </div>
        <span class="mini-tag">{{ standings().length }} atletas</span>
      </div>
      @if (!hasSchedule()) {
        <div class="empty-state">
          <span>↗</span><b>O ranking aparecerá após gerar a tabela</b
          ><small>Cadastre os atletas e gere as rodadas.</small>
        </div>
      }
      @if (hasSchedule()) {
        <div class="table-scroll">
          <table class="leaderboard">
            <thead>
              <tr>
                <th>POS.</th>
                <th>JOGADOR</th>
                <th class="numeric">WINS</th>
                <th class="numeric">JOGOS</th>
                <th class="numeric">GAMES PRÓ</th>
                <th class="numeric">CONTRA</th>
                <th class="numeric">SALDO</th>
                <th class="numeric">DESC.</th>
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
                      (click)="playerSelected.emit(row.playerId)"
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
                              class="move-chip"
                              [class.up]="move > 0"
                              [class.down]="move < 0"
                              [attr.aria-label]="
                                move > 0 ? 'subiu ' + move + ' posições' : 'caiu ' + -move + ' posições'
                              "
                              >{{ move > 0 ? '▲' : '▼' }}{{ move > 0 ? move : -move }}</i
                            >
                          }
                          @if (i === 0 && row.setsWon > 0) {
                            <em class="row-tag leader-tag">LÍDER</em>
                          }
                          @if (!!highlightId() && row.playerId === highlightId()) {
                            <em class="row-tag me-tag">VOCÊ</em>
                          }</span
                        ><small class="table-sub"
                          >{{ row.matchesPlayed }} de {{ scheduledMatches(row.playerId) }} jogos</small
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
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </article>
  `,
})
export class RankingViewComponent implements OnChanges, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private lastRanks = new Map<string, number>();
  private movementTimer: ReturnType<typeof setTimeout> | null = null;
  private movement = new Map<string, number>();
  readonly groupTables = input<GroupStandingTable[]>([]);
  readonly standings = input<PlayerStanding[]>([]);
  readonly players = input<Player[]>([]);
  readonly rounds = input<Round[]>([]);
  readonly maleStandings = input<PlayerStanding[]>([]);
  readonly femaleStandings = input<PlayerStanding[]>([]);
  readonly showGenderRankings = input(false);
  readonly genderRankingLimit = input(8);
  readonly fixedPairsMode = input(false);
  readonly hasSchedule = input(false);
  readonly highlightId = input('');
  readonly playerSelected = output<string>();

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

  isMine(entry: GroupStandingEntry): boolean {
    const highlightId = this.highlightId();
    return !!highlightId && entry.playerIds.includes(highlightId);
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
