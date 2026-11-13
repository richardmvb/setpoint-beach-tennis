import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { DashboardInsights } from '../../../core/dashboard-insights';
import { type DashboardView, heatCell } from '../data/dashboard-view';

/** The Uso e recursos tab: formats, completion by format, the week heatmap, feature adoption and moderators. */
@Component({
  selector: 'app-dashboard-usage',
  imports: [NgTemplateOutlet, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './dashboard-usage.component.html',
})
export class DashboardUsageComponent {
  readonly view = input.required<DashboardView>();
  readonly insights = input<DashboardInsights | null>(null);
  protected readonly hours = Array.from({ length: 24 }, (_, hour) => hour);
  protected readonly heatCell = heatCell;
}
