import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import type { TournamentState } from '../../../core/models';
import { QualificationStatsComponent } from '../../qualification-stats.component';
import { ProjectionController } from './projection-controller';

/**
 * The projection on screen: the stats panel (a lazy chunk) once it is unlocked, otherwise a card saying when it
 * unlocks. It reads and drives the `ProjectionController` its page provides.
 */
@Component({
  selector: 'app-projection-panel',
  imports: [TranslocoDirective, QualificationStatsComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './projection-panel.component.html',
})
export class ProjectionPanelComponent {
  protected readonly projection = inject(ProjectionController);
  /** The tournament on screen. A new object re-renders the panel. */
  readonly state = input.required<TournamentState>();
  /** The host picked another athlete (guests always see their own path). */
  readonly targetPlayerChange = output<string>();
}
