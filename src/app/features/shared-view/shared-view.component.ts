import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { DialogService } from '../../core/dialog.service';
import { fixedPairsMode, mixedFinalistCount, usesMixedFinals } from '../../domain/tournament-view/format';
import { PlayerAvatarComponent } from '../player-avatar.component';
import { RankingViewComponent } from '../ranking-view.component';
import type {
  PlayerMatchesDialogComponent,
  PlayerMatchesDialogData,
} from '../tournament/player-matches-dialog/player-matches-dialog.component';
import { ProjectionController } from '../tournament/projection/projection-controller';
import { ProjectionPanelComponent } from '../tournament/projection/projection-panel.component';
import type {
  ShareResultsDialogComponent,
  ShareResultsDialogData,
} from '../tournament/share-results-dialog/share-results-dialog.component';
import { ShareResultsSession } from '../tournament/share-results-dialog/share-results-session';
import { ArenaHeroComponent } from './components/arena-hero.component';
import { ChanceToastComponent } from './components/chance-toast.component';
import { GuestFinalsComponent } from './components/guest-finals.component';
import { GuestJoinFormComponent } from './components/guest-join-form.component';
import { GuestNavComponent } from './components/guest-nav.component';
import { GuestRoundsComponent } from './components/guest-rounds.component';
import { UpdatePillComponent } from './components/update-pill.component';
import { SharedViewStore } from './data/shared-view.store';

/** Confetti for a clinched goal: fixed positions, so every guest sees the same burst. */
const CONFETTI = Array.from({ length: 30 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i % 8) * 0.07,
  size: 6 + (i % 4) * 3,
  hue: (i * 47) % 360,
}));

/**
 * A tournament seen from outside: the public live link (`?live=`), an invite (`?invite=`) and the admin viewer
 * (`?dashboardTournament=&source=`). Read-only, except that an invited guest can join. Rendered by `AppComponent`
 * with `@defer`, so it is its own chunk; the store and the projection live and die with this page.
 */
@Component({
  selector: 'app-shared-view',
  imports: [
    TranslocoDirective,
    ArenaHeroComponent,
    ChanceToastComponent,
    GuestFinalsComponent,
    GuestJoinFormComponent,
    GuestNavComponent,
    GuestRoundsComponent,
    PlayerAvatarComponent,
    ProjectionPanelComponent,
    RankingViewComponent,
    UpdatePillComponent,
  ],
  providers: [SharedViewStore, ProjectionController, provideTranslocoScope('shared', 'tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './shared-view.component.html',
})
export class SharedViewComponent {
  protected readonly store = inject(SharedViewStore);
  protected readonly projection = inject(ProjectionController);
  private readonly dialog = inject(DialogService);
  private readonly shareSession = inject(ShareResultsSession);
  protected readonly confetti = CONFETTI;
  protected readonly format = { mixedFinalistCount, usesMixedFinals, fixedPairsMode };

  protected get shareMessage(): string {
    return this.shareSession.message();
  }

  /** Scrolls to a section, leaving the projection first when it is open. */
  protected goTo(id: string): void {
    if (this.store.showMain()) {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected openProjection(fromToast = false): void {
    const switching = this.store.tab() !== 'projection';
    const opened = fromToast ? this.store.openFromChanceToast() : this.store.openProjection();
    if (opened && switching) window.scrollTo({ top: 0 });
  }

  protected openFirstUpdate(): void {
    const target = this.store.takeFirstUpdate();
    if (!target) return;
    document.getElementById(target)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  /** The dialogs are lazy chunks: they load on the first click. */
  protected async openPlayerMatches(playerId: string): Promise<void> {
    const state = this.store.tournament();
    if (!state) return;
    const { PlayerMatchesDialogComponent: component, PLAYER_MATCHES_TITLE_ID: labelledBy } =
      await import('../tournament/player-matches-dialog/player-matches-dialog.component');
    await this.dialog.open<void, PlayerMatchesDialogData, PlayerMatchesDialogComponent>(component, {
      data: { state, playerId },
      labelledBy,
      sheetBelow: 620,
    });
  }

  protected async shareMyResults(): Promise<void> {
    const state = this.store.tournament();
    const standings = this.store.standings();
    const playerId = this.store.guestPlayerId();
    if (!state?.finals?.complete || !standings || !playerId) return;
    const { ShareResultsDialogComponent: component, SHARE_RESULTS_TITLE_ID: labelledBy } =
      await import('../tournament/share-results-dialog/share-results-dialog.component');
    await this.dialog.open<void, ShareResultsDialogData, ShareResultsDialogComponent>(component, {
      data: { state, standings: standings.all, playerId },
      labelledBy,
      sheetBelow: 600,
    });
  }
}
