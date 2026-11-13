import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ChanceToast } from '../data/shared-view.store';

/** A result moved the guest's chance: a short notice that opens "Meu caminho". */
@Component({
  selector: 'app-chance-toast',
  imports: [NgClass, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  templateUrl: './chance-toast.component.html',
})
export class ChanceToastComponent {
  readonly toast = input.required<ChanceToast>();
  readonly opened = output<void>();
}
