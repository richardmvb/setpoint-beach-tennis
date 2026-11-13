import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { DashboardInsights } from '../../../core/dashboard-insights';
import { type DashboardView, sparkPoints } from '../data/dashboard-view';

/** The Resumo tab: KPIs with their trend, the insights, tournaments per day and the funnel. */
@Component({
  selector: 'app-dashboard-summary',
  imports: [DatePipe, NgClass, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './dashboard-summary.component.html',
})
export class DashboardSummaryComponent {
  readonly view = input.required<DashboardView>();
  readonly insights = input<DashboardInsights | null>(null);
  readonly days = input(30);
  protected readonly sparkPoints = sparkPoints;
}
