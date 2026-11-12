import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-player-avatar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      [class]="avatarClass"
      [class.has-photo]="!!photoDataUrl"
      [style.width.px]="size"
      [style.height.px]="size"
      aria-hidden="true"
    >
      <img *ngIf="photoDataUrl; else initialsFallback" [src]="photoDataUrl" alt="" decoding="async" />
      <ng-template #initialsFallback>{{ initials }}</ng-template>
    </span>
  `,
})
export class PlayerAvatarComponent {
  @Input() name = '';
  @Input() photoDataUrl?: string;
  @Input() variant: 'player-avatar' | 'team-avatar' | 'share-chip-avatar' | 'podium-avatar' | 'battle-avatar' =
    'player-avatar';

  get avatarClass(): string {
    return this.variant;
  }
  get size(): number {
    switch (this.variant) {
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
    return this.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase();
  }
}
