import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective } from '@jsverse/transloco';
import { CardComponent } from '@ui/card/card.component';
import type { Player } from '../../../core/models';
import type { GroupQualification } from '../../../domain/tournament-view/group-qualification';
import { PlayerAvatarComponent } from '../../player-avatar.component';

/** The 12 athletes that reach the finals of the 20-player format, in seed order, with the group each came from. */
@Component({
  selector: 'app-qualifiers-card',
  imports: [TranslocoDirective, CardComponent, PlayerAvatarComponent],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    ':host{display:contents}',
    // Phone width: four columns must fit without a sideways scroll, so the avatar goes and the cells tighten.
    '@media (width <= 620px){.qualifiers-card table{table-layout:fixed;width:100%;min-width:0}.qualifiers-card th,.qualifiers-card td{padding-inline:4px;white-space:normal;overflow-wrap:anywhere}.qualifiers-card th:first-child,.qualifiers-card td:first-child{width:44px}.qualifiers-card th:nth-child(3),.qualifiers-card td:nth-child(3){width:56px}.qualifiers-card th:last-child,.qualifiers-card td:last-child{width:96px}.qualifiers-card app-player-avatar{display:none}.qualifiers-card .qual-chip{padding:4px 6px;font-size:9px;white-space:normal}}',
  ],
  template: `
    <ng-container *transloco="let t; prefix: 'tournament.qualifiers'">
      <article uiCard class="full-card qualifiers-card">
        <div class="card-title-row">
          <div>
            <span class="card-kicker">{{ t('kicker') }}</span>
            <h2>{{ t('title') }}</h2>
          </div>
          <span class="mini-tag">{{ t('count', { count: rows().length }) }}</span>
        </div>
        @if (provisional()) {
          <p class="muted">{{ t('provisional') }}</p>
        }
        <div class="table-scroll">
          <table class="leaderboard" [attr.aria-label]="t('title')">
            <thead>
              <tr>
                <th>{{ t('seed') }}</th>
                <th>{{ t('player') }}</th>
                <th>{{ t('group') }}</th>
                <th>{{ t('how') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.playerId; let i = $index) {
                <tr>
                  <td>
                    <span class="rank-number">{{ i + 1 }}</span>
                  </td>
                  <td>
                    <span class="ranking-player-cell">
                      <app-player-avatar [name]="row.name" [photoDataUrl]="row.photo" /><b>{{ row.name }}</b>
                    </span>
                  </td>
                  <td>{{ row.group }}</td>
                  <td>
                    <span class="qual-chip" [class.secure]="row.direct" [class.chance]="!row.direct"
                      ><span aria-hidden="true">{{ row.direct ? '✓' : '★' }}</span>
                      {{ row.direct ? t('status.direct') : t('status.bestThird') }}</span
                    >
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </article>
    </ng-container>
  `,
})
export class QualifiersCardComponent {
  readonly qualification = input.required<GroupQualification>();
  readonly players = input<Player[]>([]);
  /** The group stage is not over: the order can still change. */
  readonly provisional = input(false);

  protected readonly rows = computed(() => {
    const { qualifiers, byGroup } = this.qualification();
    const rowOf = new Map(
      byGroup.flatMap((table) => table.rows.map((row) => [row.standing.playerId, { row, group: table.name }] as const)),
    );
    return qualifiers.map((standing) => {
      const found = rowOf.get(standing.playerId);
      return {
        playerId: standing.playerId,
        name: standing.name,
        photo: this.players().find((player) => player.id === standing.playerId)?.photoDataUrl ?? '',
        group: found?.group ?? '',
        direct: found?.row.status === 'direct',
      };
    });
  });
}
