import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { TournamentStore } from './data/tournament.store';

/**
 * Shown on the organizer's pages once every final has a score and the tournament is still open. People enter the last
 * score on Partidas or Ranking and leave without finishing, so the banner asks at that moment, wherever they are.
 * The same confirmation and the same steps as the button under the podium.
 * It is loaded after the page is idle (`@defer`), so it does not weigh on the tournament chunk.
 */
@Component({
  selector: 'app-finalize-banner',
  imports: [TranslocoDirective, ButtonComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: `
    <ng-container *transloco="let t; prefix: 'organizer.finalizeBanner'">
      @if (store.canFinalizeTournament()) {
        <div class="finalize-banner" role="group" [attr.aria-label]="t('label')">
          <p>{{ t('text') }}</p>
          <button uiButton variant="primary" type="button" (click)="store.finalizeAndShow()">{{ t('action') }}</button>
        </div>
      }
    </ng-container>
  `,
  styleUrl: './finalize-banner.component.css',
})
export class FinalizeBannerComponent {
  protected readonly store = inject(TournamentStore);
}
