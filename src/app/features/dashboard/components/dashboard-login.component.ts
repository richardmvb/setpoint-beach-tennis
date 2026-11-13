import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import type { DashboardError } from '../data/dashboard.store';

/** The restricted-access screen: the admin's e-mail receives a sign-in link. */
@Component({
  selector: 'app-dashboard-login',
  imports: [FormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './dashboard-login.component.html',
})
export class DashboardLoginComponent {
  readonly email = model('');
  readonly busy = input(false);
  readonly sent = input(false);
  readonly error = input<DashboardError | null>(null);
  readonly sendRequested = output<void>();
}
