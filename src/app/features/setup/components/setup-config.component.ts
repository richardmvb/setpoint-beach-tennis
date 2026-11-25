import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarPickerComponent } from '../../avatar-picker.component';
import { ChoiceCardsComponent } from '../../choice-cards.component';
import { GenderToggleComponent } from '../../gender-toggle.component';
import { NumberRangeComponent } from '../../number-range.component';
import { SetupStore } from '../data/setup.store';
import { SetupFeedbackComponent } from './setup-feedback.component';

/** Step 1 of the wizard: the format of the tournament (and, for a shared one, who moderates it). */
@Component({
  selector: 'app-setup-config',
  imports: [
    TranslocoDirective,
    FormsModule,
    AvatarPickerComponent,
    ChoiceCardsComponent,
    GenderToggleComponent,
    NumberRangeComponent,
    SetupFeedbackComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './setup-config.component.html',
  styleUrl: './setup-config.component.css',
})
export class SetupConfigComponent {
  protected readonly store = inject(SetupStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * Enter in the name field (the phone keyboard's "Próximo") moves to the first format choice instead of leaving the
   * step: every choice has a default, so going on from here would hide them. Only the button leaves the step.
   */
  protected focusChoices(event: Event): void {
    event.preventDefault();
    this.host.nativeElement.querySelector<HTMLElement>('app-choice-cards [role="radio"][tabindex="0"]')?.focus();
  }
}
