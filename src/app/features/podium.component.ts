import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player } from '../core/models';
import { PodiumPlace } from '../core/finals.service';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

@Component({
  selector: 'app-podium',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="podium-stage" role="list">
      <div *ngFor="let slot of stage" class="podium-col" [ngClass]="'place-' + slot.place" role="listitem">
        <div class="podium-names"><strong *ngFor="let name of namesOf(slot)">{{ name }}</strong></div>
        <div class="podium-step"><span class="podium-emoji" aria-hidden="true">{{ medal(slot.place) }}</span><b>{{ slot.place }}º</b></div>
      </div>
    </div>
    <div *ngIf="fourth as place" class="podium-fourth"><span>4º</span><strong>{{ namesOf(place).join(' + ') }}</strong></div>
  `
})
export class PodiumComponent {
  @Input() places: PodiumPlace[] = [];
  @Input() players: Player[] = [];

  get stage(): PodiumPlace[] {
    return [2, 1, 3].map(place => this.places.find(item => item.place === place)).filter((item): item is PodiumPlace => !!item);
  }

  get fourth(): PodiumPlace | undefined { return this.places.find(item => item.place === 4); }

  medal(place: number): string { return MEDALS[place] ?? ''; }

  namesOf(place: PodiumPlace): string[] {
    return place.playerIds.map(id => this.players.find(player => player.id === id)?.name ?? '—');
  }
}
