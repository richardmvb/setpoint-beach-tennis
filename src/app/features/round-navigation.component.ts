import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-round-navigation',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:block}'],
  template: `
    <div class="round-nav" [class.round-nav-bottom]="position === 'bottom'">
      <button
        class="round-nav-arrow"
        type="button"
        (click)="roundSelect.emit(selectedRound - 1)"
        [disabled]="selectedRound === 0"
        aria-label="Rodada anterior"
        title="Rodada anterior"
      >
        ←
      </button>
      <span class="round-nav-current"
        ><small>RODADA</small><b>{{ selectedRound + 1 }} / {{ roundCount }}</b></span
      >
      <button
        *ngIf="!allRoundsComplete || finalsExist"
        class="round-nav-arrow"
        type="button"
        (click)="roundSelect.emit(selectedRound + 1)"
        [disabled]="selectedRound === roundCount - 1"
        aria-label="Próxima rodada"
        title="Próxima rodada"
      >
        →
      </button>
      <button
        *ngIf="allRoundsComplete && !finalsExist"
        class="button primary round-nav-ranking"
        type="button"
        (click)="ranking.emit()"
      >
        Ranking e finais →
      </button>
    </div>
  `,
})
export class RoundNavigationComponent {
  @Input() selectedRound = 0;
  @Input() roundCount = 0;
  @Input() completedRounds = 0;
  @Input() finalsExist = false;
  @Input() position: 'top' | 'bottom' = 'top';
  @Output() roundSelect = new EventEmitter<number>();
  @Output() ranking = new EventEmitter<void>();

  get allRoundsComplete(): boolean {
    return this.roundCount > 0 && this.completedRounds === this.roundCount;
  }
}
