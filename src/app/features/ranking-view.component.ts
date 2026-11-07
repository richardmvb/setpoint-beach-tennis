import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, PlayerStanding } from '../core/models';
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
      <div class="table-scroll"><table><thead><tr><th>POS.</th><th>{{ fixedPairsMode ? 'DUPLA' : 'JOGADOR' }}</th><th class="numeric">VIT.</th><th class="numeric">PRÓ</th><th class="numeric">SALDO</th><th class="numeric">JOGOS</th></tr></thead><tbody><tr *ngFor="let entry of group.entries; let i = index" [class.me-row]="isMine(entry)"><td><span class="rank-number" [class.top-three]="i < 3">{{ i + 1 }}</span></td><td><span class="ranking-player-cell"><app-player-avatar *ngFor="let id of entry.playerIds" [name]="nameOf(id)" [photoDataUrl]="photoOf(id)"></app-player-avatar><b>{{ entry.label }}</b></span></td><td class="numeric"><b>{{ entry.setsWon }}</b></td><td class="numeric">{{ entry.gamesFor }}</td><td class="numeric">{{ entry.gameBalance > 0 ? '+' : '' }}{{ entry.gameBalance }}</td><td class="numeric">{{ entry.matchesPlayed }}</td></tr></tbody></table></div>
    </article>
    <section *ngIf="showGenderRankings" class="gender-ranking-grid">
      <ng-container *ngTemplateOutlet="genderRanking; context: { title: 'RANKING MASCULINO', icon: 'male', rows: maleStandings, limit: genderRankingLimit }"></ng-container>
      <ng-container *ngTemplateOutlet="genderRanking; context: { title: 'RANKING FEMININO', icon: 'female', rows: femaleStandings, limit: genderRankingLimit }"></ng-container>
    </section>
    <ng-template #genderRanking let-title="title" let-icon="icon" let-rows="rows" let-limit="limit"><article class="surface-card gender-ranking-card"><div class="card-title-row"><div><span class="card-kicker">{{ title }}</span><h2>Top {{ limit }} classificados</h2></div><app-gender-icon [gender]="icon"></app-gender-icon></div><div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">WINS</th><th class="numeric">JOGOS</th><th class="numeric">PRÓ</th><th class="numeric">CONTRA</th><th class="numeric">SALDO</th><th class="numeric">DESC.</th></tr></thead><tbody><tr *ngFor="let row of rows.slice(0, limit); let i = index" [class.gender-cut]="i === limit - 1"><td><span class="rank-number" [class.top-three]="i < 3">{{ (i + 1).toString().padStart(2, '0') }}</span></td><td><button type="button" class="ranking-player-cell ranking-player-button" (click)="playerSelected.emit(row.playerId)"><app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)"></app-player-avatar><app-gender-icon [gender]="icon"></app-gender-icon><span class="ranking-player-name"><b>{{ row.name }}</b><small class="table-sub">{{ row.matchesPlayed }} jogos</small></span></button></td><td class="numeric"><b>{{ row.setsWon }}</b></td><td class="numeric">{{ row.matchesPlayed }}</td><td class="numeric">{{ row.gamesFor }}</td><td class="numeric">{{ row.gamesAgainst }}</td><td class="numeric"><b [class.positive]="row.gameBalance > 0" [class.negative]="row.gameBalance < 0">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b></td><td class="numeric">{{ row.rests }}</td></tr></tbody></table></div></article></ng-template>
    <article class="surface-card full-card">
      <div class="card-title-row"><div><span class="card-kicker">CLASSIFICAÇÃO GERAL</span><h2>Ranking individual</h2></div><span class="mini-tag">{{ standings.length }} atletas</span></div>
      <div *ngIf="!hasSchedule" class="empty-state"><span>↗</span><b>O ranking aparecerá após gerar a tabela</b><small>Cadastre os atletas e gere as rodadas.</small></div>
      <div *ngIf="hasSchedule" class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">WINS</th><th class="numeric">JOGOS</th><th class="numeric">GAMES PRÓ</th><th class="numeric">CONTRA</th><th class="numeric">SALDO</th><th class="numeric">DESC.</th></tr></thead><tbody><tr *ngFor="let row of standings; let i = index" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2" [class.me-row]="!!highlightId && row.playerId === highlightId"><td><span class="rank-number" [class.top-three]="i < 3">{{ (i + 1).toString().padStart(2, '0') }}</span></td><td><button type="button" class="ranking-player-cell ranking-player-button" (click)="playerSelected.emit(row.playerId)"><app-player-avatar [name]="row.name" [photoDataUrl]="photoOf(row.playerId)"></app-player-avatar><app-gender-icon *ngIf="genderOf(row.playerId)" [gender]="genderOf(row.playerId)!" ></app-gender-icon><span class="ranking-player-name"><b>{{ row.name }}</b><small class="table-sub">{{ row.matchesPlayed }} jogos</small></span></button></td><td class="numeric"><b>{{ row.setsWon }}</b></td><td class="numeric">{{ row.matchesPlayed }}</td><td class="numeric">{{ row.gamesFor }}</td><td class="numeric">{{ row.gamesAgainst }}</td><td class="numeric"><b [class.positive]="row.gameBalance > 0" [class.negative]="row.gameBalance < 0">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b></td><td class="numeric">{{ row.rests }}</td></tr></tbody></table></div>
    </article>
  `
})
export class RankingViewComponent {
  @Input() groupTables: GroupStandingTable[] = [];
  @Input() standings: PlayerStanding[] = [];
  @Input() players: Player[] = [];
  @Input() maleStandings: PlayerStanding[] = [];
  @Input() femaleStandings: PlayerStanding[] = [];
  @Input() showGenderRankings = false;
  @Input() genderRankingLimit = 8;
  @Input() fixedPairsMode = false;
  @Input() hasSchedule = false;
  @Input() highlightId = '';
  @Output() playerSelected = new EventEmitter<string>();

  isMine(entry: GroupStandingEntry): boolean { return !!this.highlightId && entry.playerIds.includes(this.highlightId); }
  nameOf(playerId: string): string { return this.players.find(player => player.id === playerId)?.name ?? ''; }
  photoOf(playerId: string): string { return this.players.find(player => player.id === playerId)?.photoDataUrl ?? ''; }
  genderOf(playerId: string) { return this.players.find(player => player.id === playerId)?.gender; }
}
