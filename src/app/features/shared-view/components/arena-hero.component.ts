import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ArenaView } from '../data/shared-view.store';

/** The tournament's hero card: name, status, counters and progress. */
@Component({
  selector: 'app-arena-hero',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './arena-hero.component.html',
})
export class ArenaHeroComponent {
  readonly arena = input.required<ArenaView>();
  readonly versionLabel = input.required<string>();
}
