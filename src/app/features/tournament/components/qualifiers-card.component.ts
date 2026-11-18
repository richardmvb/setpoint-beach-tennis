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
    // Phone width: every column must fit without a sideways scroll, so the avatar goes and the cells tighten.
    '.qualifier-rules{margin-top:12px}.qualifier-rules ol{margin:6px 0 0;padding-left:20px;color:var(--muted);font-size:13px;line-height:1.5}',
    '@media (width <= 620px){.qualifiers-card table{table-layout:fixed;width:100%;min-width:0}.qualifiers-card th,.qualifiers-card td{padding-inline:4px;white-space:normal;overflow-wrap:anywhere}.qualifiers-card th:first-child,.qualifiers-card td:first-child{width:40px}.qualifiers-card th:nth-child(3),.qualifiers-card td:nth-child(3){width:58px}.qualifiers-card th:nth-child(n+4),.qualifiers-card td:nth-child(n+4){width:38px}.qualifiers-card app-player-avatar{display:none}}',
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
        <p class="muted">{{ provisional() ? t('provisional') : t('settled') }}</p>
        <div class="table-scroll">
          <table class="leaderboard" [attr.aria-label]="t('title')">
            <thead>
              <tr>
                <th>{{ t('seed') }}</th>
                <th>{{ t('player') }}</th>
                <th>{{ t('group') }}</th>
                <th class="numeric">{{ t('winsShort') }}</th>
                <th class="numeric">{{ t('balance') }}</th>
                <th class="numeric">{{ t('gamesForShort') }}</th>
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
                  <td>{{ t('groupPlace', { group: row.group, place: row.position }) }}</td>
                  <td class="numeric">
                    <b>{{ row.setsWon }}</b>
                  </td>
                  <td class="numeric">{{ row.gameBalance > 0 ? '+' : '' }}{{ row.gameBalance }}</td>
                  <td class="numeric">{{ row.gamesFor }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="qualifier-rules">
          <span class="card-kicker">{{ t('rulesKicker') }}</span>
          <ol>
            <li>{{ t('ruleHow') }}</li>
            <li>{{ t('ruleOrder') }}</li>
            <li>{{ t('ruleGroupOrder') }}</li>
          </ol>
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
        position: found?.row.position ?? 0,
        setsWon: standing.setsWon,
        gameBalance: standing.gameBalance,
        gamesFor: standing.gamesFor,
      };
    });
  });
}
