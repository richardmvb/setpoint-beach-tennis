import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerStanding } from '../core/models';

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
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <article *ngFor="let group of groupTables" class="surface-card full-card group-ranking-card">
      <div class="card-title-row"><div><span class="card-kicker">{{ group.name }}</span><h2>Classificação</h2></div><span class="mini-tag">{{ fixedPairsMode ? 'Duplas' : 'Atletas' }}</span></div>
      <div class="table-scroll"><table><thead><tr><th>POS.</th><th>{{ fixedPairsMode ? 'DUPLA' : 'JOGADOR' }}</th><th class="numeric">VIT.</th><th class="numeric">PRÓ</th><th class="numeric">SALDO</th><th class="numeric">JOGOS</th></tr></thead><tbody><tr *ngFor="let entry of group.entries; let i = index"><td><span class="rank-number" [class.top-three]="i < 3">{{ i + 1 }}</span></td><td><b>{{ entry.label }}</b></td><td class="numeric"><b>{{ entry.setsWon }}</b></td><td class="numeric">{{ entry.gamesFor }}</td><td class="numeric">{{ entry.gameBalance > 0 ? '+' : '' }}{{ entry.gameBalance }}</td><td class="numeric">{{ entry.matchesPlayed }}</td></tr></tbody></table></div>
    </article>
    <article class="surface-card full-card">
      <div class="card-title-row"><div><span class="card-kicker">CLASSIFICAÇÃO GERAL</span><h2>Ranking individual</h2></div><span class="mini-tag">{{ standings.length }} atletas</span></div>
      <div *ngIf="!hasSchedule" class="empty-state"><span>↗</span><b>O ranking aparecerá após gerar a tabela</b><small>Cadastre os atletas e gere as rodadas.</small></div>
      <div *ngIf="hasSchedule" class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">SETS</th><th class="numeric">GAMES PRÓ</th><th class="numeric">CONTRA</th><th class="numeric">SALDO</th><th class="numeric">DESC.</th></tr></thead><tbody><tr *ngFor="let row of standings; let i = index" [class.rank-gold]="i === 0" [class.rank-silver]="i === 1" [class.rank-bronze]="i === 2"><td><span class="rank-number" [class.top-three]="i < 3">{{ (i + 1).toString().padStart(2, '0') }}</span></td><td><b>{{ row.name }}</b><small class="table-sub">{{ row.matchesPlayed }} jogos</small></td><td class="numeric"><b>{{ row.setsWon }}</b></td><td class="numeric">{{ row.gamesFor }}</td><td class="numeric">{{ row.gamesAgainst }}</td><td class="numeric"><b [class.positive]="row.gameBalance > 0" [class.negative]="row.gameBalance < 0">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</b></td><td class="numeric">{{ row.rests }}</td></tr></tbody></table></div>
    </article>
  `
})
export class RankingViewComponent {
  @Input() groupTables: GroupStandingTable[] = [];
  @Input() standings: PlayerStanding[] = [];
  @Input() fixedPairsMode = false;
  @Input() hasSchedule = false;
}
