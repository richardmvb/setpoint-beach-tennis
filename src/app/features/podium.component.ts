import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player } from '../core/models';
import { PodiumPlace } from '../core/finals.service';
import { PlayerAvatarComponent } from './player-avatar.component';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

@Component({
  selector: 'app-podium',
  standalone: true,
  imports: [CommonModule, PlayerAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="podium-stage" role="list">
      <div
        *ngFor="let slot of stage; trackBy: trackByPlace"
        class="podium-card"
        [ngClass]="'place-' + slot.place"
        [class.mine]="isMine(slot)"
        role="listitem"
      >
        <span class="podium-medal" aria-hidden="true">{{ medal(slot.place) }}</span>
        <div class="podium-faces">
          <app-player-avatar
            *ngFor="let id of slot.playerIds"
            [name]="nameOf(id)"
            [photoDataUrl]="photoOf(id)"
            variant="battle-avatar"
          ></app-player-avatar>
        </div>
        <div class="podium-who">
          <b *ngFor="let id of slot.playerIds" [class.me]="id === highlightId">{{ nameOf(id) }}</b>
        </div>
        <span class="podium-rank">{{ slot.place }}º lugar</span>
      </div>
    </div>
    <div *ngIf="fourth as place" class="podium-fourth">
      <span>4º</span
      ><strong
        ><ng-container *ngFor="let id of place.playerIds; let last = last"
          ><span class="podium-fourth-player" [class.me]="id === highlightId"
            ><app-player-avatar
              [name]="nameOf(id)"
              [photoDataUrl]="photoOf(id)"
              variant="podium-avatar"
            ></app-player-avatar
            ><span class="podium-player-name">{{ nameOf(id) }}</span></span
          >{{ last ? '' : ' + ' }}</ng-container
        ></strong
      >
    </div>
  `,
})
export class PodiumComponent {
  @Input() places: PodiumPlace[] = [];
  @Input() players: Player[] = [];
  @Input() highlightId = '';

  nameOf(id: string): string {
    return this.players.find((player) => player.id === id)?.name ?? '—';
  }
  photoOf(id: string): string {
    return this.players.find((player) => player.id === id)?.photoDataUrl ?? '';
  }

  get stage(): PodiumPlace[] {
    return [2, 1, 3]
      .map((place) => this.places.find((item) => item.place === place))
      .filter((item): item is PodiumPlace => !!item);
  }

  trackByPlace(_: number, slot: PodiumPlace): number {
    return slot.place;
  }

  isMine(slot: PodiumPlace): boolean {
    return !!this.highlightId && slot.playerIds.includes(this.highlightId);
  }

  get fourth(): PodiumPlace | undefined {
    return this.places.find((item) => item.place === 4);
  }

  medal(place: number): string {
    return MEDALS[place] ?? '';
  }

  namesOf(place: PodiumPlace): string[] {
    return place.playerIds.map((id) => this.players.find((player) => player.id === id)?.name ?? '—');
  }
}
