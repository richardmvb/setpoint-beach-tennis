import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { DialogService } from '../../../core/dialog.service';
import { AvatarPickerComponent } from '../../avatar-picker.component';
import { GenderIconComponent } from '../../gender-icon.component';
import { GenderToggleComponent } from '../../gender-toggle.component';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import {
  BATCH_TITLE_ID,
  BatchPlayersDialogComponent,
  type BatchPlayersDialogData,
} from '../batch-players-dialog/batch-players-dialog.component';
import type { BatchDraft } from '../../../domain/tournament-setup/batch';
import { SetupStore } from '../data/setup.store';
import { SetupFeedbackComponent } from './setup-feedback.component';

type HintKey =
  | 'sharedOne'
  | 'sharedMany'
  | 'sharedFull'
  | 'mixedMissing'
  | 'mixedComplete'
  | 'openOne'
  | 'openMany'
  | 'openComplete';

/** Step 2 of the wizard: the athletes (typed, pasted in a batch, or joining by the invite link of a shared tournament). */
@Component({
  selector: 'app-setup-players',
  imports: [
    TranslocoDirective,
    FormsModule,
    DatePipe,
    ButtonComponent,
    AvatarPickerComponent,
    GenderIconComponent,
    GenderToggleComponent,
    PlayerAvatarComponent,
    SetupFeedbackComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './setup-players.component.html',
  styleUrl: './setup-players.component.css',
})
export class SetupPlayersComponent {
  protected readonly store = inject(SetupStore);
  private readonly dialog = inject(DialogService);

  /** The enrolment hint under the progress bar, as a key and its numbers. */
  protected readonly hint = computed(() => {
    const e = this.store.enrollment();
    const params = { missing: e.missing, men: 0, women: 0, half: 0 };
    let key: HintKey;
    if (e.kind === 'shared') key = e.missing > 1 ? 'sharedMany' : e.missing === 1 ? 'sharedOne' : 'sharedFull';
    else if (e.kind === 'mixed') {
      Object.assign(params, { men: e.men, women: e.women, half: e.half });
      key = e.missing > 0 ? 'mixedMissing' : 'mixedComplete';
    } else key = e.missing > 1 ? 'openMany' : e.missing === 1 ? 'openOne' : 'openComplete';
    return { key, params };
  });

  protected pad(position: number): string {
    return (position + 1).toString().padStart(2, '0');
  }

  protected addPlayer(): void {
    if (this.store.addPlayer() && !this.store.full())
      // Keep the field ready for the next name (the keyboard stays open on phones).
      window.setTimeout(() => document.getElementById('wizardPlayerName')?.focus());
  }

  protected async openBatch(): Promise<void> {
    const drafts = await this.dialog.open<readonly BatchDraft[], BatchPlayersDialogData, BatchPlayersDialogComponent>(
      BatchPlayersDialogComponent,
      {
        data: { state: this.store.state() },
        labelledBy: BATCH_TITLE_ID,
        autoFocus: 'dialog',
        backdropClass: 'ui-backdrop-plain',
        sheetBelow: 620,
      },
    );
    if (drafts?.length) this.store.addBatch(drafts);
  }
}
