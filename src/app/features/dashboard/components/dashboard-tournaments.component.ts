import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import type {
  DashboardActiveTournament,
  DashboardActivity,
  DashboardMetrics,
} from '../../../core/ports/dashboard.port';
import { type AbandonmentStage, durationParts, type ListMode } from '../data/dashboard-view';

/** A row of the list, with the link that opens it in the admin viewer. */
export type DashboardTournamentRow = DashboardActiveTournament & { viewerUrl: string };

/** The Torneios tab: active and archived tournaments, where abandoned ones stopped, and every counter. */
@Component({
  selector: 'app-dashboard-tournaments',
  imports: [DatePipe, FormsModule, NgTemplateOutlet, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './dashboard-tournaments.component.html',
})
export class DashboardTournamentsComponent {
  readonly activity = input<DashboardActivity | null>(null);
  readonly metrics = input<DashboardMetrics | null>(null);
  readonly tournaments = input<DashboardTournamentRow[]>([]);
  readonly stages = input<AbandonmentStage[]>([]);
  readonly stagesTotal = input(0);
  readonly dropoff = input<AbandonmentStage | null>(null);
  readonly listMode = model<ListMode>('active');
  readonly search = model('');
  protected readonly durationParts = durationParts;
}
