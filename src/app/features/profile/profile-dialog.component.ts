import { DialogRef } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { AvatarPickerComponent } from '../avatar-picker.component';
import { GenderToggleComponent } from '../gender-toggle.component';
import { PhaseLabelComponent } from '../tournament/phase-label.component';
import { type ProfileDialogResult, ProfilePanelStore } from './data/profile-panel.store';

/** Id of the dialog's title, which names it (aria-labelledby). */
export const PROFILE_TITLE_ID = 'profileTitle';
/** Id of the first-visit intro text, which describes the dialog while it is shown. */
export const PROFILE_WELCOME_TEXT_ID = 'profileWelcomeText';

/**
 * Who you are on this device (name, photo, category, auto-join), the three latest saved tournaments and the theme.
 * Open it with `DialogService.open` (a popover under the top bar on a large screen, a sheet on a phone; focus trap,
 * Escape and a click outside close it) with `ProfileDialogData`. It closes with a `ProfileDialogResult` when the
 * organizer goes on to "Meus torneios", and with nothing otherwise.
 */
@Component({
  selector: 'app-profile-dialog',
  imports: [
    TranslocoDirective,
    DatePipe,
    ButtonComponent,
    AvatarPickerComponent,
    GenderToggleComponent,
    PhaseLabelComponent,
  ],
  providers: [ProfilePanelStore, provideTranslocoScope('profile')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-dialog.component.html',
  styleUrl: './profile-dialog.component.css',
})
export class ProfileDialogComponent {
  protected readonly store = inject(ProfilePanelStore);
  private readonly ref = inject<DialogRef<ProfileDialogResult>>(DialogRef);
  protected readonly titleId = PROFILE_TITLE_ID;
  protected readonly welcomeTextId = PROFILE_WELCOME_TEXT_ID;
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // The first-visit panel asks for the name, so the cursor goes there. The field appears once the panel's text has
    // loaded, which can be after the dialog opened, so this waits for it instead of relying on the dialog's autofocus.
    if (this.store.welcome) effect(() => this.nameInput()?.nativeElement.focus());
  }

  protected close(): void {
    this.ref.close();
  }

  protected showAll(): void {
    this.ref.close({ kind: 'library' });
  }

  protected openTournament(id: string): void {
    this.ref.close({ kind: 'open', id });
  }

  protected importBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // So the same file can be chosen again.
    input.value = '';
    if (file) this.ref.close({ kind: 'import', file });
  }
}
