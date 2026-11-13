import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** "N novas atualizações": the tournament changed while the viewer was reading. Tapping scrolls to the first change. */
@Component({
  selector: 'app-update-pill',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `<ng-container *transloco="let t; prefix: 'shared.updates'"
    ><button class="guest-update-button" type="button" (click)="opened.emit()">
      <span aria-hidden="true">↓</span>{{ count() === 1 ? t('one') : t('many', { count: count() }) }}
    </button></ng-container
  >`,
})
export class UpdatePillComponent {
  readonly count = input.required<number>();
  readonly opened = output<void>();
}
