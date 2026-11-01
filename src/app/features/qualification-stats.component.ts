import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QualificationRow } from '../core/qualification.service';

@Component({
  selector: 'app-qualification-stats',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <article *ngIf="mine as row" class="surface-card full-card qual-card">
      <div class="card-title-row"><div><span class="card-kicker">PROJEÇÃO · TOP 3</span><h2>{{ row.headline }}</h2></div><span class="qual-chip" [ngClass]="row.status">{{ statusLabel(row) }}</span></div>
      <p class="muted qual-detail">{{ row.detail }}</p>
      <div class="qual-grid">
        <div><small>POSIÇÃO</small><b>{{ row.position }}º</b></div>
        <div><small>VITÓRIAS</small><b>{{ row.wins }}</b></div>
        <div><small>JOGOS RESTANTES</small><b>{{ row.remainingMatches }}</b></div>
        <div><small>VITÓRIAS NECESSÁRIAS</small><b>{{ row.winsNeeded ?? '—' }}</b></div>
        <div><small>GAMES RESTANTES</small><b>até {{ row.remainingGames }}</b></div>
        <div><small>SALDO · 3º</small><b>{{ signed(row.balance) }} · {{ signed(row.thirdBalance) }}</b></div>
      </div>
      <small class="muted">Empate em vitórias é decidido pelo saldo de games.</small>
    </article>
    <article *ngIf="!highlightId && rows.length" class="surface-card full-card qual-card">
      <div class="card-title-row"><div><span class="card-kicker">PROJEÇÃO · TOP 3</span><h2>Caminho para o top 3</h2></div></div>
      <div class="table-scroll"><table class="qual-table"><thead><tr><th>POS.</th><th>JOGADOR</th><th class="numeric">VIT.</th><th class="numeric">RESTAM</th><th class="numeric">META</th><th class="numeric">GAMES</th><th>SITUAÇÃO</th></tr></thead>
        <tbody><tr *ngFor="let row of rows"><td>{{ row.position }}º</td><td><b>{{ row.name }}</b></td><td class="numeric">{{ row.wins }}</td><td class="numeric">{{ row.remainingMatches }}</td><td class="numeric">{{ row.winsNeeded ?? '—' }}</td><td class="numeric">{{ row.remainingGames }}</td><td><span class="qual-chip" [ngClass]="row.status">{{ statusLabel(row) }}</span></td></tr></tbody></table></div>
    </article>
  `
})
export class QualificationStatsComponent {
  @Input() rows: QualificationRow[] = [];
  @Input() highlightId = '';

  get mine(): QualificationRow | undefined {
    return this.highlightId ? this.rows.find(row => row.playerId === this.highlightId) : undefined;
  }

  statusLabel(row: QualificationRow): string {
    switch (row.status) {
      case 'secure': return 'Garantido';
      case 'inside': return 'No top 3';
      case 'out': return 'Fora';
      default: return 'Na briga';
    }
  }

  signed(value: number): string { return value > 0 ? `+${value}` : String(value); }
}
