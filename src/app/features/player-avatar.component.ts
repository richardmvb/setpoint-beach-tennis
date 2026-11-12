import { ChangeDetectionStrategy, Component, Input, input } from '@angular/core';

@Component({
  selector: 'app-player-avatar',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      [class]="avatarClass"
      [class.has-photo]="!!photoDataUrl"
      [style.width.px]="size"
      [style.height.px]="size"
      aria-hidden="true"
    >
      @if (photoDataUrl) {
        <img [src]="photoDataUrl" alt="" decoding="async" />
      } @else {
        {{ initials }}
      }
    </span>
  `,
})
export class PlayerAvatarComponent {
  readonly name = input('');
  @Input() photoDataUrl?: string;
  readonly variant = input<'player-avatar' | 'team-avatar' | 'share-chip-avatar' | 'podium-avatar' | 'battle-avatar'>(
    'player-avatar',
  );

  get avatarClass(): string {
    return this.variant();
  }
  get size(): number {
    switch (this.variant()) {
      case 'team-avatar':
        return 24;
      case 'share-chip-avatar':
        return 34;
      case 'podium-avatar':
        return 26;
      case 'battle-avatar':
        return 40;
      default:
        return 32;
    }
  }
  get initials(): string {
    return this.name()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();
  }
}
