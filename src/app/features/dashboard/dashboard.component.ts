import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { provideTranslocoScope, TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { NpsFeedbackService } from '../../core/nps-feedback.service';
import { DashboardLoginComponent } from './components/dashboard-login.component';
import { DashboardSummaryComponent } from './components/dashboard-summary.component';
import { DashboardTournamentsComponent } from './components/dashboard-tournaments.component';
import { DashboardUsageComponent } from './components/dashboard-usage.component';
import { DashboardStore } from './data/dashboard.store';

/**
 * The admin dashboard (`/dashboard`): the e-mail sign-in, then the product numbers in three tabs. Rendered by
 * `AppComponent` with `@defer`, so it is its own chunk; the store lives and dies with this page.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    TranslocoDirective,
    TranslocoPipe,
    DashboardLoginComponent,
    DashboardSummaryComponent,
    DashboardTournamentsComponent,
    DashboardUsageComponent,
  ],
  providers: [DashboardStore, provideTranslocoScope('dashboard')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly nps = inject(NpsFeedbackService);
  protected readonly periods = [7, 30, 90];
  /** "Voltar ao app": the page around it leaves the dashboard route. */
  readonly back = output<void>();
}
