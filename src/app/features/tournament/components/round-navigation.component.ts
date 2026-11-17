import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';

@Component({
  selector: 'app-round-navigation',
  standalone: true,
  imports: [ButtonComponent, TranslocoDirective],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './round-navigation.component.css',
  template: `
    <ng-container *transloco="let t; prefix: 'organizer.roundNav'">
      <div class="round-nav" [class.round-nav-bottom]="position() === 'bottom'">
        <button
          class="round-nav-arrow"
          type="button"
          (click)="roundSelect.emit(selectedRound() - 1)"
          [disabled]="selectedRound() === 0"
          [attr.aria-label]="t('previous')"
          [title]="t('previous')"
        >
          ←
        </button>
        <span class="round-nav-current"
          ><small>{{ t('round') }}</small
          ><b>{{ selectedRound() + 1 }} / {{ roundCount() }}</b></span
        >
        @if (!allRoundsComplete || finalsExist()) {
          <button
            class="round-nav-arrow"
            type="button"
            (click)="roundSelect.emit(selectedRound() + 1)"
            [disabled]="selectedRound() === roundCount() - 1"
            [attr.aria-label]="t('next')"
            [title]="t('next')"
          >
            →
          </button>
        }
        @if (allRoundsComplete && !finalsExist()) {
          <button uiButton variant="primary" class="round-nav-ranking" (click)="ranking.emit()">
            {{ t('rankingAndFinals') }} →
          </button>
        }
      </div>
    </ng-container>
  `,
})
export class RoundNavigationComponent {
  readonly selectedRound = input(0);
  readonly roundCount = input(0);
  readonly completedRounds = input(0);
  readonly finalsExist = input(false);
  readonly position = input<'top' | 'bottom'>('top');
  readonly roundSelect = output<number>();
  readonly ranking = output<void>();

  get allRoundsComplete(): boolean {
    return this.roundCount() > 0 && this.completedRounds() === this.roundCount();
  }
}
