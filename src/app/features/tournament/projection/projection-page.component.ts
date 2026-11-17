import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentStore } from '../data/tournament.store';
import { ProjectionPanelComponent } from './projection-panel.component';

/**
 * Projeção, the host's view of the qualification projection. The controller that computes it is the shell's (it needs
 * the standings and the athlete the host picked), so the page only shows the panel and reports the picked athlete.
 */
@Component({
  selector: 'section[appProjectionPage]',
  imports: [ProjectionPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'projection-page' },
  template: `<app-projection-panel
    [state]="store.state()"
    (targetPlayerChange)="store.request({ kind: 'projectionTarget', playerId: $event })"
  />`,
})
export class ProjectionPageComponent {
  protected readonly store = inject(TournamentStore);
}
