import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, PlayerStanding, Round } from '../core/models';
import { PlayerAvatarComponent } from './player-avatar.component';
import { GenderIconComponent } from './gender-icon.component';

export interface GroupStandingEntry {
  label: string;
  playerIds: string[];
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  matchesPlayed: number;
}

export interface GroupStandingTable {
  id: string;
  name: string;
  entries: GroupStandingEntry[];
}

@Component({
  selector: 'app-ranking-view',
  standalone: true,
  imports: [CommonModule, PlayerAvatarComponent, GenderIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <article *ngFor="let group of groupTables" class="surface-card full-card group-ranking-card">
      <div class="card-title-row"><div><span class="card-kicker">{{ group.name }}</span><h2>Classificação</h2></div><span class="mini-tag">{{ fixedPairsMode ? 'Duplas' : 'Atletas' }}</span></div>
      <div class="table-scroll"><table class="leaderboard"><thead><tr><th>POS.</th><th>{{ fixedPairsMode ? 'DUPLA' : 'JOGADOR' }}</th><th class="numeric">VIT.</th><th class="numeric">PRÓ</th><th class="numeric">SALDO</th><th class="numeric">JOGOS</th></tr></thead><tbody><tr *ngFor="let entry of group.entries; let i = index" [class.me-row]="isMine(entry)" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2"><td><span class="rank-number" [class.top-three]="i < 3" [class.medal]="i < 3" [attr.data-place]="i + 1">{{ i + 1 }}</span></td><td><span class="ranking-player-cell"><app-player-avatar *ngFor="let id of entry.playerIds" [name]="nameOf(id)" [photoDataUrl]="photoOf(id)"></app-player-avatar><b>{{ entry.label }}</b><em *ngIf="isMine(entry)" class="row-tag me-tag">VOCÊ</em></span></td><td class="numeric"><b>{{ entry.setsWon }}</b></td><td class="numeric">{{ entry.gamesFor }}</td><td class="numeric"><b class="balance-chip" [class.positive]="entry.gameBalance > 0" [class.negative]="entry.gameBalance < 0">{{ entry.gameBalance > 0 ? '+' : '' }}{{ entry.gameBalance }}</b></td><td class="numeric">{{ entry.matchesPlayed }} / {{ scheduledMatches(entry.playerIds[0]) }}</td></tr></tbody></table></div>
    </article>
    <section *ngIf="showGenderRankings" class="gender-ranking-grid">
      <ng-container *ngTemplateOutlet="genderRanking; context: { title: 'RANKING MASCULINO', icon: 'male', rows: maleStandings, limit: genderRankingLimit }"></ng-container>
      <ng-container *ngTemplateOutlet="genderRanking; context: { title: 'RANKING FEMININO', icon: 'female', rows: femaleStandings, limit: genderRankingLimit }"></ng-container>
    </section>
    <ng-template #genderRanking let-title="title" let-icon="icon" let-rows="rows" let-limit="limit"><article class="surface-card gender-ranking-card"><div class="card-title-row"><div><span class="card-kicker">{{ title }}</span><h2>Top {{ limit }} classificados</h2></div><app-gender-icon [gender]="icon"></app-gender-icon></div><div class="table-scroll"><table class="leaderboard"><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">WINS</th><th class="numeric">JOGOS</th><th class="numeric">PRÓ</th><th class="numeric">CONTRA</th><th class="numeric">SALDO</th><th class="numeric">DESC.</th></tr></thead><tbody><tr *ngFor="let row of rows.slice(0, limit); let i = index" [class.gender-cut]="i === limit - 1" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2"><td><span class="rank-number" [class.top-three]="i < 3" [class.medal]="i < 3" [attr.data-place]="i + 1">{{ (i + 1).toString().padStart(2, '0') }}</span></td><td><button type="button" class="ranking-player-cell ranking-player-button" (click)="playerSelected.emit(row.playerId)"><app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)"></app-player-avatar><app-gender-icon [gender]="icon"></app-gender-icon><span class="ranking-player-name"><b>{{ row.name }}</b><small class="table-sub">{{ row.matchesPlayed }} de {{ scheduledMatches(row.playerId) }} jogos</small></span></button></td><td class="numeric"><b>{{ row.setsWon }}</b></td><td class="numeric">{{ row.matchesPlayed }} / {{ scheduledMatches(row.playerId) }}</td><td class="numeric">{{ row.gamesFor }}</td><td class="numeric">{{ row.gamesAgainst }}</td><td class="numeric"><b class="balance-chip" [class.positive]="row.gameBalance > 0" [class.negative]="row.gameBalance < 0">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b></td><td class="numeric">{{ row.rests }}</td></tr></tbody></table></div></article></ng-template>
    <article class="surface-card full-card">
      <div class="card-title-row"><div><span class="card-kicker">CLASSIFICAÇÃO GERAL</span><h2>Ranking individual</h2></div><span class="mini-tag">{{ standings.length }} atletas</span></div>
      <div *ngIf="!hasSchedule" class="empty-state"><span>↗</span><b>O ranking aparecerá após gerar a tabela</b><small>Cadastre os atletas e gere as rodadas.</small></div>
      <div *ngIf="hasSchedule" class="table-scroll"><table class="leaderboard"><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">WINS</th><th class="numeric">JOGOS</th><th class="numeric">GAMES PRÓ</th><th class="numeric">CONTRA</th><th class="numeric">SALDO</th><th class="numeric">DESC.</th></tr></thead><tbody><tr *ngFor="let row of standings; let i = index" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2" [class.me-row]="!!highlightId && row.playerId === highlightId"><td><span class="rank-number" [class.top-three]="i < 3" [class.medal]="i < 3" [attr.data-place]="i + 1">{{ (i + 1).toString().padStart(2, '0') }}</span></td><td><button type="button" class="ranking-player-cell ranking-player-button" (click)="playerSelected.emit(row.playerId)"><app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)"></app-player-avatar><app-gender-icon *ngIf="genderOf(row.playerId)" [gender]="genderOf(row.playerId)!" ></app-gender-icon><span class="ranking-player-name"><span class="ranking-name-line"><b>{{ row.name }}</b><i *ngIf="moveOf(row.playerId) as move" class="move-chip" [class.up]="move > 0" [class.down]="move < 0" [attr.aria-label]="move > 0 ? 'subiu ' + move + ' posições' : 'caiu ' + (-move) + ' posições'">{{ move > 0 ? '▲' : '▼' }}{{ move > 0 ? move : -move }}</i><em *ngIf="i === 0 && row.setsWon > 0" class="row-tag leader-tag">LÍDER</em><em *ngIf="!!highlightId && row.playerId === highlightId" class="row-tag me-tag">VOCÊ</em></span><small class="table-sub">{{ row.matchesPlayed }} de {{ scheduledMatches(row.playerId) }} jogos</small><span class="form-bar" aria-hidden="true"><i [style.width.%]="barPercent(row)"></i></span></span></button></td><td class="numeric"><b>{{ row.setsWon }}</b></td><td class="numeric">{{ row.matchesPlayed }} / {{ scheduledMatches(row.playerId) }}</td><td class="numeric">{{ row.gamesFor }}</td><td class="numeric">{{ row.gamesAgainst }}</td><td class="numeric"><b class="balance-chip" [class.positive]="row.gameBalance > 0" [class.negative]="row.gameBalance < 0">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b></td><td class="numeric">{{ row.rests }}</td></tr></tbody></table></div>
    </article>
  `
})
export class RankingViewComponent implements OnChanges, OnDestroy {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private lastRanks = new Map<string, number>();
  private movementTimer: ReturnType<typeof setTimeout> | null = null;
  private movement = new Map<string, number>();
  @Input() groupTables: GroupStandingTable[] = [];
  @Input() standings: PlayerStanding[] = [];
  @Input() players: Player[] = [];
  @Input() rounds: Round[] = [];
  @Input() maleStandings: PlayerStanding[] = [];
  @Input() femaleStandings: PlayerStanding[] = [];
  @Input() showGenderRankings = false;
  @Input() genderRankingLimit = 8;
  @Input() fixedPairsMode = false;
  @Input() hasSchedule = false;
  @Input() highlightId = '';
  @Output() playerSelected = new EventEmitter<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['standings']) return;
    const ranks = new Map(this.standings.map((row, index) => [row.playerId, index] as const));
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
        this.movementTimer = setTimeout(() => { this.movement = new Map(); this.changeDetector.markForCheck(); }, 30000);
      }
    }
    this.lastRanks = ranks;
  }

  ngOnDestroy(): void { if (this.movementTimer) clearTimeout(this.movementTimer); }

  moveOf(playerId: string): number { return this.movement.get(playerId) ?? 0; }
  barPercent(row: PlayerStanding): number {
    const best = this.standings.reduce((max, item) => Math.max(max, item.setsWon), 0);
    return best ? Math.round(row.setsWon / best * 100) : 0;
  }

  isMine(entry: GroupStandingEntry): boolean { return !!this.highlightId && entry.playerIds.includes(this.highlightId); }
  scheduledMatches(playerId: string): number {
    return this.rounds.reduce((total, round) => total + round.matches.filter(match =>
      match.teamA.includes(playerId) || match.teamB.includes(playerId)).length, 0);
  }
  nameOf(playerId: string): string { return this.players.find(player => player.id === playerId)?.name ?? ''; }
  photoOf(playerId: string): string { return this.players.find(player => player.id === playerId)?.photoDataUrl ?? ''; }
  genderOf(playerId: string) { return this.players.find(player => player.id === playerId)?.gender; }
}
