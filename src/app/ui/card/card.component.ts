import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CardPadding = 'md' | 'lg' | 'none';

/**
 * A surface that groups related content: `<section uiCard>`, `<article uiCard padding="lg">`. It keeps the element's
 * own tag and extra classes. The look lives in src/styles/components/card.css.
 */
@Component({
  selector: '[uiCard]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'surface-card',
    '[class.card-lg]': 'padding() === "lg"',
    '[class.card-flush]': 'padding() === "none"',
  },
})
export class CardComponent {
  readonly padding = input<CardPadding>('md');
}
