import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import type { TournamentState } from '../../../core/models';
import { fixedPairsMode } from '../../../domain/tournament-view/format';
import { rankingRules } from '../../../domain/tournament-view/ranking-explanation';

export interface RankingHelpDialogData {
  /** The tournament as it was when the dialog opened: the explanation uses its numbers. */
  state: TournamentState;
}

/** Id of the dialog's title, which names it (aria-labelledby). */
export const RANKING_HELP_TITLE_ID = 'ranking-help-title';

/** One column of the Grupos 20 diagram: the places of a group, coloured by what each place can reach. */
type PlaceKind = 'direct' | 'third' | 'out';

/**
 * "Como funciona o ranking": the rules of this tournament's format in a few steps, with its own numbers (groups,
 * places in the finals, best thirds). Opened from the criteria strip with `DialogService.open`.
 */
@Component({
  selector: 'app-ranking-help-dialog',
  imports: [TranslocoDirective, ButtonComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ranking-help-modal' },
  templateUrl: './ranking-help-dialog.component.html',
  styleUrl: './ranking-help-dialog.component.css',
})
export class RankingHelpDialogComponent {
  private readonly data = inject<RankingHelpDialogData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);

  protected readonly titleId = RANKING_HELP_TITLE_ID;
  protected readonly rules = rankingRules(this.data.state);
  protected readonly fixedPairs = fixedPairsMode(this.data.state);
  /** Grupos 20: each group's places, best first, for the small diagram. */
  protected readonly diagram: { name: string; places: PlaceKind[] }[] = (this.data.state.groups ?? []).map((group) => ({
    name: group.name.replace(/^\S+\s+/, ''),
    places: group.playerIds.map((_, index): PlaceKind => (index < 2 ? 'direct' : index === 2 ? 'third' : 'out')),
  }));

  close(): void {
    this.ref.close();
  }
}
