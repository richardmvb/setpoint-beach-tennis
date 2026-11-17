import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentStore } from '../data/tournament.store';
import { ProjectionController } from './projection-controller';
import { ProjectionTarget } from './projection-target';
import { ProjectionPanelComponent } from './projection-panel.component';

/**
 * Projeção, the host's view of the qualification projection. The controller that computes it is the shell's (it needs
 * the standings and the athlete the host picked), so the page shows the panel and records the picked athlete.
 */
@Component({
  selector: 'section[appProjectionPage]',
  imports: [ProjectionPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'projection-page' },
  template: `<app-projection-panel [state]="store.state()" (targetPlayerChange)="pick($event)" />`,
})
export class ProjectionPageComponent {
  protected readonly store = inject(TournamentStore);
  private readonly target = inject(ProjectionTarget);
  private readonly projection = inject(ProjectionController);

  protected pick(playerId: string): void {
    this.target.set(playerId);
    this.projection.playerChanged();
  }
}
