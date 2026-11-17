import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { LocalLiveLink } from '../../../core/local-live-link';

/** The public "follow live" link of the tournament: make it, copy it, and why it could not be made. */
@Component({
  selector: 'article[appLiveLinkCard]',
  imports: [TranslocoDirective, ButtonComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // What `uiCard` gives, on the host: an attribute component cannot share an element with `uiCard`.
  host: { class: 'surface-card full-card data-card' },
  templateUrl: './live-link-card.component.html',
  styleUrl: './live-link-card.component.css',
})
export class LiveLinkCardComponent {
  protected readonly link = inject(LocalLiveLink);
}
