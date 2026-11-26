import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';

/**
 * The tie-break order in one line, always visible above the ranking, with the button that opens "Como funciona".
 * The numbers match the ones in the athlete's Posição block and in the help dialog.
 */
@Component({
  selector: 'app-ranking-criteria',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ranking-criteria.component.css',
  template: `
    <ng-container *transloco="let t; prefix: 'tournament.criteria'">
      <div class="ranking-criteria">
        <div class="criteria-strip">
          <span class="criteria-label" id="ranking-criteria-label">{{ t('label') }}</span>
          <ol aria-labelledby="ranking-criteria-label">
            <li><span class="criteria-number" aria-hidden="true">1</span>{{ t('wins') }}</li>
            <li><span class="criteria-number" aria-hidden="true">2</span>{{ t('balance') }}</li>
            <li><span class="criteria-number" aria-hidden="true">3</span>{{ t('gamesFor') }}</li>
            <li><span class="criteria-number" aria-hidden="true">4</span>{{ t('headToHead') }}</li>
            <li><span class="criteria-number" aria-hidden="true">5</span>{{ t('draw') }}</li>
          </ol>
        </div>
        <button type="button" class="criteria-help" (click)="helpRequested.emit()">
          <span aria-hidden="true">?</span> {{ t('help') }}
        </button>
      </div>
    </ng-container>
  `,
})
export class RankingCriteriaComponent {
  readonly helpRequested = output();
}
