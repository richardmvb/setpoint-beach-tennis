import { describe, expect, it } from 'vitest';
import { formatLabel, heatmapGrid } from '../../../core/dashboard-insights';
import { dashboardActivity, dashboardInsights, dashboardTournament } from '../../../testing/dashboard-data';
import {
  abandonmentStages,
  buildDashboardView,
  durationParts,
  heatCell,
  mainDropoff,
  sparkPoints,
  visibleTournaments,
} from './dashboard-view';

describe('abandonmentStages and mainDropoff', () => {
  it('lists every stage in order with its share of the total', () => {
    const stages = abandonmentStages(dashboardActivity());
    expect(stages.map((stage) => [stage.id, stage.count, stage.percent])).toEqual([
      ['registration', 2, 17],
      ['noScores', 1, 8],
      ['underHalf', 3, 25],
      ['overHalf', 0, 0],
      ['roundsComplete', 0, 0],
      ['finals', 1, 8],
      ['unknown', 5, 42],
    ]);
  });

  it('the main drop-off is the largest known stage, never "unknown"; none without abandons', () => {
    expect(mainDropoff(abandonmentStages(dashboardActivity()))?.id).toBe('underHalf');
    const none = dashboardActivity({
      abandoned_registration: 0,
      abandoned_no_scores: 0,
      abandoned_under_half: 0,
      abandoned_finals: 0,
    });
    expect(mainDropoff(abandonmentStages(none))).toBeNull();
    expect(abandonmentStages(null)).toEqual([]);
    expect(abandonmentStages(dashboardActivity({ ...none, abandoned_unknown: 0 })).every((s) => s.percent === 0)).toBe(
      true,
    );
  });
});

describe('buildDashboardView', () => {
  const view = buildDashboardView(dashboardInsights(), mainDropoff(abandonmentStages(dashboardActivity())));

  it('orders each mix by count with its percentage, keeping the raw keys for the template', () => {
    expect(view.mixes.map((mix) => mix.kind)).toEqual(['mode', 'size', 'doubles', 'hosting']);
    expect(view.mixes[0].rows).toEqual([
      { key: 'super', count: 7, percent: 70 },
      { key: 'groups', count: 3, percent: 30 },
    ]);
    expect(view.mixes[1].rows.map((row) => row.key)).toEqual(['8', '12', '24']);
  });

  it('lists the adopted features in a fixed order with their share', () => {
    expect(view.adoption.map((item) => [item.id, item.percent])).toEqual([
      ['live_link', 50],
      ['qualification', 60],
      ['point_by_point', 33],
      ['early_finals', 0],
      ['mixed_doubles', 20],
      ['fixed_pairs', 33],
    ]);
  });

  it('splits moderators by how many tournaments they organized', () => {
    expect(view.retention).toEqual([
      { id: 'one', count: 4, percent: 40 },
      { id: 'two', count: 4, percent: 40 },
      { id: 'threePlus', count: 2, percent: 20 },
    ]);
  });

  it('labels the completion by format and passes the drop-off to the insights in pt-BR', () => {
    expect(view.formats).toEqual([{ label: formatLabel('super', 8, 'open'), started: 5, finished: 4, rate: 80 }]);
    expect(view.cards.length).toBeGreaterThan(0);
    expect(view.funnel[0]?.key).toBe('started');
    const withDropoff = buildDashboardView(dashboardInsights(), { id: 'underHalf', count: 3, percent: 25 });
    expect(withDropoff.insights.some((insight) => insight.title.includes('menos da metade das partidas'))).toBe(true);
  });
});

describe('visibleTournaments', () => {
  const activity = dashboardActivity({
    active_tournaments: [
      dashboardTournament({ id: 'x', name: 'Copa Verão' }),
      dashboardTournament({ id: 'y', name: 'Liga' }),
    ],
  });

  it('shows the chosen list, filtered by a case-insensitive search', () => {
    expect(visibleTournaments(activity, 'active', '').map((item) => item.id)).toEqual(['x', 'y']);
    expect(visibleTournaments(activity, 'active', '  verão ').map((item) => item.id)).toEqual(['x']);
    expect(visibleTournaments(activity, 'archived', '').map((item) => item.id)).toEqual(['a1']);
    expect(visibleTournaments(null, 'active', '')).toEqual([]);
  });
});

describe('small helpers', () => {
  it('draws a sparkline in a 100x26 box', () => {
    expect(sparkPoints([0, 2, 1])).toBe('0.0,24.0 50.0,2.0 100.0,13.0');
    expect(sparkPoints([5])).toBe('0.0,2.0');
  });

  it('scales a heat cell by the busiest one', () => {
    const grid = heatmapGrid([{ dow: 1, hour: 9, count: 4 }]);
    expect(heatCell(2, grid)).toBe(0.5);
    expect(heatCell(2, heatmapGrid([]))).toBe(0);
  });

  it('splits a duration into hours and minutes', () => {
    expect(durationParts(5400)).toEqual({ hours: 1, minutes: 30 });
    expect(durationParts(600)).toEqual({ hours: 0, minutes: 10 });
    expect(durationParts(-5)).toEqual({ hours: 0, minutes: 0 });
    expect(durationParts(null)).toBeNull();
  });
});
