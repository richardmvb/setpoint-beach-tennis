import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import type { Match } from '../../../core/models';
import type { FinalScoreStatus, RoundScoreStatus } from '../../../domain/tournament-play/score-entry';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { TournamentStore } from '../data/tournament.store';

/** A score field changed: the side and what was typed (`null` for an empty field). */
export interface ScoreEdit {
  side: 'a' | 'b';
  value: number | null;
}

/**
 * The two pairs of a match with a games field on each side and the line that says whether the score is saved: the
 * markup a group-stage match and a typed final share. It shows what it is given and says what was typed; the page
 * decides what a score is worth. A child of the tournament pages, so it reads the names and photos from their store.
 */
@Component({
  selector: 'app-match-score-form',
  imports: [FormsModule, TranslocoDirective, PlayerAvatarComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './match-score-form.component.html',
  styleUrl: './match-score-form.component.css',
})
export class MatchScoreFormComponent {
  protected readonly store = inject(TournamentStore);
  readonly match = input.required<Match>();
  readonly a = input<number | null>(null);
  readonly b = input<number | null>(null);
  /** The most games a side can have. */
  readonly max = input.required<number>();
  readonly disabled = input(false);
  readonly labelA = input.required<string>();
  readonly labelB = input.required<string>();
  readonly status = input.required<RoundScoreStatus | FinalScoreStatus>();
  readonly scoreChange = output<ScoreEdit>();
}
