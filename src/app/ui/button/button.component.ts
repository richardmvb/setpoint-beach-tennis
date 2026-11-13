import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

/**
 * A button or link styled as a button. Use it as an attribute: `<button uiButton variant="primary">Save</button>`
 * or `<a uiButton href="...">`. A `<button>` defaults to `type="button"` so it never submits a form by accident.
 * Extra classes on the element are kept. The look lives in src/styles/components/button.css.
 */
@Component({
  selector: 'button[uiButton], a[uiButton]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'button',
    '[class.primary]': 'variant() === "primary"',
    '[class.secondary]': 'variant() === "secondary"',
    '[class.danger]': 'variant() === "danger"',
    '[class.ghost]': 'variant() === "ghost"',
    '[class.sm]': 'size() === "sm"',
    '[attr.type]': 'typeAttribute()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  /** Only applies to a `<button>`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  private readonly isButton = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName === 'BUTTON';
  protected readonly typeAttribute = computed(() => (this.isButton ? this.type() : null));
}
