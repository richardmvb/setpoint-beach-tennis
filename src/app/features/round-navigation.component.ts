import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-round-navigation',
  standalone: true,
  imports: [],
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
      @if (!allRoundsComplete || finalsExist) {
        <button
          class="round-nav-arrow"
          type="button"
          (click)="roundSelect.emit(selectedRound + 1)"
          [disabled]="selectedRound === roundCount - 1"
          aria-label="Próxima rodada"
          title="Próxima rodada"
        >
          →
        </button>
      }
      @if (allRoundsComplete && !finalsExist) {
        <button class="button primary round-nav-ranking" type="button" (click)="ranking.emit()">
          Ranking e finais →
        </button>
      }
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
