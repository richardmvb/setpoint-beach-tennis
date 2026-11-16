import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import type { PlayerGender, TournamentState } from '../../../core/models';
import { type BatchDraft, canConfirmBatch, parseBatch, validateBatch } from '../../../domain/tournament-setup/batch';
import { isMixedDoubles } from '../../../domain/tournament-view/format';
import { GenderToggleComponent } from '../../gender-toggle.component';

/** Id of the dialog's title, which names it (aria-labelledby). */
export const BATCH_TITLE_ID = 'batchTitle';

/** What the dialog needs to check a list: the tournament as it is now (its roster and its size). */
export interface BatchPlayersDialogData {
  state: TournamentState;
}

/**
 * "Adicionar em lote": paste one athlete per line, preview them, fix what is wrong and add them all. Open it with
 * `DialogService.open` (focus trap, Escape and a click outside close it) and the `ui-backdrop-plain` backdrop. It
 * closes with the validated list when confirmed, and with nothing otherwise; the setup page adds the athletes. The
 * frame is the global `.batch-modal` look, the preview is this component's own CSS.
 */
@Component({
  selector: 'app-batch-players-dialog',
  imports: [TranslocoDirective, FormsModule, ButtonComponent, GenderToggleComponent],
  providers: [provideTranslocoScope('setup')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'batch-modal' },
  templateUrl: './batch-players-dialog.component.html',
  styleUrl: './batch-players-dialog.component.css',
})
export class BatchPlayersDialogComponent {
  private readonly ref = inject<DialogRef<readonly BatchDraft[]>>(DialogRef);
  private readonly data = inject<BatchPlayersDialogData>(DIALOG_DATA);
  protected readonly titleId = BATCH_TITLE_ID;
  protected readonly mixed = isMixedDoubles(this.data.state);
  protected readonly filled = this.data.state.players.length;
  protected readonly size = this.data.state.size;
  protected readonly text = signal('');
  protected readonly drafts = signal<BatchDraft[]>([]);
  protected readonly canConfirm = computed(() => canConfirmBatch(this.drafts()));
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');

  constructor() {
    // The text of the dialog loads after it opens, so the cursor goes to the list once the field exists.
    effect(() => this.field()?.nativeElement.focus());
  }

  protected close(): void {
    this.ref.close();
  }

  protected preview(): void {
    this.drafts.set(validateBatch(parseBatch(this.text()), this.data.state));
  }

  protected rename(index: number, name: string): void {
    this.change(index, { name });
  }

  protected setGender(index: number, gender: PlayerGender): void {
    this.change(index, { gender });
  }

  protected confirm(): void {
    const checked = validateBatch(this.drafts(), this.data.state);
    this.drafts.set(checked);
    if (canConfirmBatch(checked)) this.ref.close(checked);
  }

  private change(index: number, patch: Partial<BatchDraft>): void {
    this.drafts.update((drafts) =>
      validateBatch(
        drafts.map((draft, position) => (position === index ? { ...draft, ...patch } : draft)),
        this.data.state,
      ),
    );
  }
}
