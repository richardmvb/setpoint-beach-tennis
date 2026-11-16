import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import type { TournamentPhase } from '../../core/state-machines';

/** The name of a tournament's phase ("Em andamento", "Finais"), translated. */
@Component({
  selector: 'app-phase-label',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './phase-label.component.html',
})
export class PhaseLabelComponent {
  readonly phase = input.required<TournamentPhase>();
}
