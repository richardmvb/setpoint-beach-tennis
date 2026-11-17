import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { TextKey, TextParams } from '../../../core/dashboard-insights';

/**
 * The words of the dashboard's numbers: the insight sentences, the KPI labels and hints, the funnel steps, the weekdays
 * and the format names (`dashboard/pt-BR`, groups `insights`, `kpi`, `funnelStep`, `weekday`, `format`, `delta`,
 * `abandonment`). The model in `core/dashboard-insights` is pure and asks for text by key (`TextKey`, one name per
 * piece of text); this answers. The keys are not written at the call, so they are declared for the keys manager in the
 * list below (a keys-manager comment marker, one per key): add a key there when it is added to `TextKey` and to the JSON.
 *
 * Keys:
 * t(dashboard.insights.volume.new.title)
 * t(dashboard.insights.volume.new.detail)
 * t(dashboard.insights.volume.up.title)
 * t(dashboard.insights.volume.up.detail)
 * t(dashboard.insights.volume.down.title)
 * t(dashboard.insights.volume.down.detail)
 * t(dashboard.insights.volume.stable.title)
 * t(dashboard.insights.volume.stable.detail)
 * t(dashboard.insights.completion.low.title)
 * t(dashboard.insights.completion.low.detail)
 * t(dashboard.insights.completion.high.title)
 * t(dashboard.insights.completion.high.detail)
 * t(dashboard.insights.funnel.title)
 * t(dashboard.insights.funnel.detailScores)
 * t(dashboard.insights.funnel.detailOther)
 * t(dashboard.insights.dropoff.title)
 * t(dashboard.insights.dropoff.detail)
 * t(dashboard.insights.format.title)
 * t(dashboard.insights.format.detail)
 * t(dashboard.insights.peak.title)
 * t(dashboard.insights.peak.detail)
 * t(dashboard.insights.retention.low.title)
 * t(dashboard.insights.retention.low.detail)
 * t(dashboard.insights.retention.high.title)
 * t(dashboard.insights.retention.high.detail)
 * t(dashboard.insights.qualification.low.title)
 * t(dashboard.insights.qualification.low.detail)
 * t(dashboard.insights.qualification.high.title)
 * t(dashboard.insights.qualification.high.detail)
 * t(dashboard.insights.pbp.title)
 * t(dashboard.insights.pbp.detail)
 * t(dashboard.insights.hosting.title)
 * t(dashboard.insights.hosting.detail)
 * t(dashboard.insights.coverage.title)
 * t(dashboard.insights.coverage.detail)
 * t(dashboard.weekday.0)
 * t(dashboard.weekday.1)
 * t(dashboard.weekday.2)
 * t(dashboard.weekday.3)
 * t(dashboard.weekday.4)
 * t(dashboard.weekday.5)
 * t(dashboard.weekday.6)
 * t(dashboard.format.superOpen)
 * t(dashboard.format.superMixed)
 * t(dashboard.format.groupsOpen)
 * t(dashboard.format.groupsMixed)
 * t(dashboard.funnelStep.started)
 * t(dashboard.funnelStep.with_scores)
 * t(dashboard.funnelStep.half_played)
 * t(dashboard.funnelStep.rounds_done)
 * t(dashboard.funnelStep.reached_finals)
 * t(dashboard.funnelStep.finished)
 * t(dashboard.delta.flat)
 * t(dashboard.delta.new)
 * t(dashboard.kpi.started.label)
 * t(dashboard.kpi.started.hint)
 * t(dashboard.kpi.completion.label)
 * t(dashboard.kpi.completion.hintSome)
 * t(dashboard.kpi.completion.hintNone)
 * t(dashboard.kpi.players.label)
 * t(dashboard.kpi.players.hintAverage)
 * t(dashboard.kpi.players.hintNone)
 * t(dashboard.kpi.matches.label)
 * t(dashboard.kpi.matches.hint)
 * t(dashboard.kpi.moderators.label)
 * t(dashboard.kpi.moderators.hintOne)
 * t(dashboard.kpi.moderators.hintMany)
 * t(dashboard.kpi.duration.label)
 * t(dashboard.kpi.duration.hintNone)
 * t(dashboard.kpi.duration.hintP90)
 * t(dashboard.abandonment.registration)
 * t(dashboard.abandonment.noScores)
 * t(dashboard.abandonment.underHalf)
 * t(dashboard.abandonment.overHalf)
 * t(dashboard.abandonment.roundsComplete)
 * t(dashboard.abandonment.finals)
 * t(dashboard.abandonment.unknown)
 */
@Injectable()
export class DashboardText {
  private readonly transloco = inject(TranslocoService);

  readonly text = (key: TextKey, params?: TextParams): string =>
    this.transloco.translate(key, params, 'dashboard/pt-BR');
}
