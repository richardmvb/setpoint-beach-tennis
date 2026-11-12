import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
      @for (slot of stage; track trackByPlace($index, slot)) {
        <div class="podium-card" [ngClass]="'place-' + slot.place" [class.mine]="isMine(slot)" role="listitem">
          <span class="podium-medal" aria-hidden="true">{{ medal(slot.place) }}</span>
          <div class="podium-faces">
            @for (id of slot.playerIds; track id) {
              <app-player-avatar [name]="nameOf(id)" [photoDataUrl]="photoOf(id)" variant="battle-avatar" />
            }
          </div>
          <div class="podium-who">
            @for (id of slot.playerIds; track id) {
              <b [class.me]="id === highlightId()">{{ nameOf(id) }}</b>
            }
          </div>
          <span class="podium-rank">{{ slot.place }}º lugar</span>
        </div>
      }
    </div>
    @if (fourth; as place) {
      <div class="podium-fourth">
        <span>4º</span
        ><strong>
          @for (id of place.playerIds; track id; let last = $last) {
            <span class="podium-fourth-player" [class.me]="id === highlightId()"
              ><app-player-avatar [name]="nameOf(id)" [photoDataUrl]="photoOf(id)" variant="podium-avatar" /><span
                class="podium-player-name"
                >{{ nameOf(id) }}</span
              ></span
            >{{ last ? '' : ' + ' }}
          }
        </strong>
      </div>
    }
  `,
})
export class PodiumComponent {
  readonly places = input<PodiumPlace[]>([]);
  readonly players = input<Player[]>([]);
  readonly highlightId = input('');

  nameOf(id: string): string {
    return this.players().find((player) => player.id === id)?.name ?? '—';
  }
  photoOf(id: string): string {
    return this.players().find((player) => player.id === id)?.photoDataUrl ?? '';
  }

  get stage(): PodiumPlace[] {
    return [2, 1, 3]
      .map((place) => this.places().find((item) => item.place === place))
      .filter((item): item is PodiumPlace => !!item);
  }

  trackByPlace(_: number, slot: PodiumPlace): number {
    return slot.place;
  }

  isMine(slot: PodiumPlace): boolean {
    const highlightId = this.highlightId();
    return !!highlightId && slot.playerIds.includes(highlightId);
  }

  get fourth(): PodiumPlace | undefined {
    return this.places().find((item) => item.place === 4);
  }

  medal(place: number): string {
    return MEDALS[place] ?? '';
  }

  namesOf(place: PodiumPlace): string[] {
    return place.playerIds.map((id) => this.players().find((player) => player.id === id)?.name ?? '—');
  }
}
