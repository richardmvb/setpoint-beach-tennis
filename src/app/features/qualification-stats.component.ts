import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoalProjection, QualificationRow } from '../core/qualification.service';

@Component({
  selector: 'app-qualification-stats',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
    <div *ngIf="open" class="qual-backdrop" role="presentation" (click)="close.emit()">
      <section class="qual-modal" role="dialog" aria-modal="true" aria-labelledby="qualTitle" (click)="$event.stopPropagation()">
        <header class="qual-modal-header"><div><span class="card-kicker">ESTATÍSTICAS DA RODADA</span><h2 id="qualTitle">Seu caminho</h2></div><button class="qual-close" type="button" (click)="close.emit()" aria-label="Fechar">×</button></header>
        <div class="qual-controls">
          <label *ngIf="!isGuest"><span>Atleta</span><select [value]="targetPlayerId" (change)="changePlayer($event)"><option *ngFor="let row of rows" [value]="row.playerId">{{ row.name }}</option></select></label>
          <label><span>Objetivo</span><select [value]="targetPlace" (change)="changeGoal($event)"><option value="1">Ser campeão</option><option value="2">Chegar ao top 2</option><option value="3">Chegar ao top 3</option></select></label>
        </div>
        <ng-container *ngIf="projection as goal">
          <section class="qual-recommendation"><span class="qual-position">{{ goal.position }}º agora</span><h3>{{ goal.headline }}</h3><p>{{ goal.guidance }}</p></section>
          <div class="qual-grid">
            <div><small>VITÓRIAS</small><b>{{ goal.wins }}</b></div>
            <div><small>JOGOS RESTANTES</small><b>{{ goal.remainingMatches }}</b></div>
            <div><small>META DE VITÓRIAS</small><b>{{ goal.winsNeeded }}</b></div>
            <div><small>GAMES EM DISPUTA</small><b>até {{ goal.remainingGames }}</b></div>
          </div>
          <section *ngIf="goal.threats.length" class="qual-guidance-section"><h3>Quem acompanhar</h3><article *ngFor="let rival of goal.threats" class="qual-guidance-row"><span class="qual-rank">{{ rival.position }}º</span><div><b>{{ rival.name }}</b><p>{{ rival.lossesNeeded > rival.remainingMatches ? 'Ainda pode ficar à frente mesmo perdendo todos os jogos restantes.' : 'Para sua projeção, precisa perder ' + rival.lossesNeeded + ' de ' + rival.remainingMatches + ' jogos.' }}</p></div></article></section>
          <section *ngIf="goal.keyMatches.length" class="qual-guidance-section"><h3>Partidas-chave</h3><article *ngFor="let match of goal.keyMatches" class="qual-key-match"><small>RODADA {{ match.round }}<span *ngIf="match.direct"> · SEU JOGO</span></small><b>{{ match.teamA }} <span>×</span> {{ match.teamB }}</b><p>{{ match.guidance }}</p></article></section>
          <p class="qual-method-note">Cenário considera você vencendo os jogos restantes. A projeção usa vitórias; empates podem ser decididos pelo saldo de games e confronto direto.</p>
        </ng-container>
        <p *ngIf="!projection" class="muted">Não há dados suficientes para esta projeção.</p>
      </section>
    </div>
  `
})
export class QualificationStatsComponent {
  @Input() rows: QualificationRow[] = [];
  @Input() highlightId = '';
  @Input() projection: GoalProjection | null = null;
  @Input() targetPlayerId = '';
  @Input() targetPlace = 3;
  @Input() isGuest = false;
  @Input() open = false;
  @Output() targetPlayerIdChange = new EventEmitter<string>();
  @Output() targetPlaceChange = new EventEmitter<number>();
  @Output() close = new EventEmitter<void>();

  changePlayer(event: Event): void {
    this.targetPlayerIdChange.emit((event.target as HTMLSelectElement).value);
  }

  changeGoal(event: Event): void {
    this.targetPlaceChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
