import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import type { FinalStage, Match } from '../../../core/models';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { finalsBracket } from '../../../domain/tournament-view/bracket';
import { FinalsBracketComponent } from '../components/finals-bracket.component';
import { FinalLiveScoreComponent } from '../components/final-live-score.component';
import { MatchScoreFormComponent, type ScoreEdit } from '../components/match-score-form.component';
import { TournamentStore } from '../data/tournament.store';
import { PodiumSectionComponent } from './podium-section.component';

type FinalsView = 'games' | 'bracket';
const FINALS_VIEW_KEY = 'setpoint.finals.view';

/**
 * The finals: each match with its result (typed games and tie-break, or point by point for the championship), and
 * once they are complete, the podium section. A child of the ranking page, so it reads the page's store.
 */
@Component({
  selector: 'article[appFinalsCard]',
  imports: [
    FormsModule,
    TranslocoDirective,
    ButtonComponent,
    FinalLiveScoreComponent,
    FinalsBracketComponent,
    MatchScoreFormComponent,
    PodiumSectionComponent,
  ],
  providers: [provideTranslocoScope('organizer', 'tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The card's own look (what `uiCard` gives): an attribute component cannot share an element with `uiCard`, and a
  // wrapper element would change what `:first-child` rules match, so the host carries the classes.
  host: { class: 'surface-card full-card finals-card' },
  templateUrl: './finals-card.component.html',
  styleUrl: './finals-card.component.css',
})
export class FinalsCardComponent {
  protected readonly store = inject(TournamentStore);
  private readonly local = inject(LOCAL_STORE);
  /**
   * What the organizer sees: the matches, where scores are typed (the default), or the knockout tree. Kept on this
   * device, so an organizer who prefers the tree finds it again.
   */
  protected readonly view = signal<FinalsView>(this.storedView());
  readonly final = input.required<FinalStage>();
  /** The knockout tree, for the formats that have one; the list below stays where scores are typed. */
  protected readonly bracket = computed(() => finalsBracket(this.final(), (match) => this.store.winnerSide(match)));

  protected setView(view: FinalsView): void {
    this.view.set(view);
    try {
      this.local.setItem(FINALS_VIEW_KEY, view);
    } catch {
      // Storage can be full or blocked: the choice then lasts until the page is left.
    }
  }

  private storedView(): FinalsView {
    try {
      return this.local.getItem(FINALS_VIEW_KEY) === 'bracket' ? 'bracket' : 'games';
    } catch {
      return 'games';
    }
  }

  protected score(match: Match, edit: ScoreEdit): void {
    this.store.finalScoreChanged(match, edit.side, edit.value);
  }

  protected tieBreak(match: Match, side: 'tieBreakA' | 'tieBreakB', value: number | null): void {
    this.store.finalScoreChanged(match, side, value);
  }

  /** The two pairs are known: a final waiting for a semifinal to be decided has nobody to score yet. */
  protected ready(match: Match): boolean {
    return !!match.teamA[0] && !!match.teamB[0];
  }
}
