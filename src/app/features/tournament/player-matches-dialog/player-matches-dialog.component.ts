import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { FinalsService } from '../../../core/finals.service';
import type { FinalMatchKind, Player, TournamentState } from '../../../core/models';
import { playerMatches, scheduledGroupMatches } from '../../../domain/tournament-view/player-matches';
import { rankedStandingGroups } from '../../../domain/tournament-view/standings';
import { PlayerAvatarComponent } from '../../player-avatar.component';

export interface PlayerMatchesDialogData {
  /** The tournament as it was when the dialog opened. */
  state: TournamentState;
  playerId: string;
}

/** One row of the list, ready for the template. A missing name (`null`) is a player removed from the roster. */
interface MatchRow {
  roundNumber: number | null;
  finalKind: FinalMatchKind | undefined;
  partnerName: string | null;
  opponentNames: (string | null)[];
  scoreFor: number | null;
  scoreAgainst: number | null;
  tieBreak: { for: number; against: number } | null;
  result: 'win' | 'loss' | null;
}

/** Id of the dialog's title, which names it (aria-labelledby). */
export const PLAYER_MATCHES_TITLE_ID = 'player-matches-title';

/**
 * Every match of one player, opened from the ranking. Open it with `DialogService.open` (focus trap, Escape and a
 * click outside close it). The look lives in the global `.player-matches-modal` rules (src/styles.css).
 */
@Component({
  selector: 'app-player-matches-dialog',
  imports: [TranslocoDirective, PlayerAvatarComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'player-matches-modal' },
  templateUrl: './player-matches-dialog.component.html',
})
export class PlayerMatchesDialogComponent {
  private readonly data = inject<PlayerMatchesDialogData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly finals = inject(FinalsService);

  protected readonly titleId = PLAYER_MATCHES_TITLE_ID;
  protected readonly player: Player | undefined = this.data.state.players.find(
    (player) => player.id === this.data.playerId,
  );
  protected readonly played =
    rankedStandingGroups(this.data.state)
      .flat()
      .find((row) => row.playerId === this.data.playerId)?.matchesPlayed ?? 0;
  protected readonly total = scheduledGroupMatches(this.data.state, this.data.playerId);
  protected readonly matches: MatchRow[] = this.buildRows();

  close(): void {
    this.ref.close();
  }

  /** Names joined with " + ", a removed player shown with the given label. */
  protected joinNames(names: (string | null)[], removed: string): string {
    return names.map((name) => name ?? removed).join(' + ');
  }

  private buildRows(): MatchRow[] {
    const names = new Map(this.data.state.players.map((player) => [player.id, player.name]));
    const nameOf = (id: string): string | null => names.get(id) ?? null;
    return playerMatches(this.data.state, this.data.playerId, (match) => this.finals.winnerSide(match)).map(
      (match) => ({
        roundNumber: match.phase.kind === 'round' ? match.phase.number : null,
        finalKind: match.phase.kind === 'final' ? match.phase.finalKind : undefined,
        partnerName: nameOf(match.partnerId),
        opponentNames: match.opponentIds.map(nameOf),
        scoreFor: match.scoreFor,
        scoreAgainst: match.scoreAgainst,
        tieBreak: match.tieBreak,
        result: match.result,
      }),
    );
  }
}
