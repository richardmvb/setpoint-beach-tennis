import { scrollBehavior } from '../../../core/motion';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';
import type { Match } from '../../../core/models';
import { PlayerAvatarComponent } from '../../player-avatar.component';
import { MatchScoreFormComponent, type ScoreEdit } from '../components/match-score-form.component';
import { RoundNavigationComponent } from '../components/round-navigation.component';
import { TournamentStore } from '../data/tournament.store';

/**
 * Partidas: the calendar of rounds, one round at a time, with a score for each match. The page is the `<section>`
 * itself, so the DOM keeps its shape; `TournamentComponent` renders it.
 */
@Component({
  selector: 'section[appRoundsPage]',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    TranslocoDirective,
    ButtonComponent,
    CardComponent,
    PlayerAvatarComponent,
    RoundNavigationComponent,
    MatchScoreFormComponent,
  ],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rounds-page' },
  templateUrl: './rounds-page.component.html',
  styleUrl: './rounds-page.component.css',
})
export class RoundsPageComponent {
  protected readonly store = inject(TournamentStore);
  private readonly transloco = inject(TranslocoService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected select(index: number): void {
    this.store.selectRound(index);
    // The tab bar scrolls sideways on a phone: bring the chosen tab to the middle (after the tab is marked active).
    window.setTimeout(() => {
      const tabs = this.element.nativeElement.querySelector<HTMLElement>('.round-tabs');
      const tab = this.element.nativeElement.querySelector<HTMLElement>(`#round-tab-${index}`);
      if (!tabs || !tab) return;
      const offset =
        tab.getBoundingClientRect().left - tabs.getBoundingClientRect().left - (tabs.clientWidth - tab.clientWidth) / 2;
      tabs.scrollTo({
        left: tabs.scrollLeft + offset,
        behavior: scrollBehavior(),
      });
    }, 0);
  }

  /** Group, then the court, or (court queue: the drawn court is meaningless) the round the match belongs to. */
  protected matchLabel(match: Match, roundNumber: number): string {
    const group = match.groupId ? `${this.store.groupName(match.groupId)} · ` : '';
    return this.store.usesCourtQueue()
      ? group + this.transloco.translate('rounds.roundTag', { number: roundNumber }, 'organizer/pt-BR')
      : group + this.transloco.translate('rounds.court', { number: match.court }, 'organizer/pt-BR');
  }

  protected score(match: Match, edit: ScoreEdit): void {
    this.store.scoreChanged(match, edit.side, edit.value);
  }
}
