import { describe, expect, it } from 'vitest';
import type { FinalMatchKind, FinalStage, Match } from '../../core/models';
import { match as baseMatch } from '../../testing/tournament-state';
import { finalsBracket } from './bracket';

type Team = [string, string];
const E: Team = ['', ''];
const d = (n: number): Team => [`d${n}a`, `d${n}b`];

function fm(id: string, kind: FinalMatchKind, a: Team, b: Team, extra: Partial<Match> = {}): Match {
  return baseMatch(`final-${id}`, a, b, null, null, { phase: 'final', finalKind: kind, ...extra });
}
const stage = (matches: Match[]): FinalStage => ({ matches, complete: false, podiumPlayerIds: [] });
const tail = (): Match[] => [fm('championship', 'championship', E, E), fm('third-place', 'third-place', E, E)];
const byeStage = (extra: Match[] = []): FinalStage =>
  stage([
    fm('qfb-1', 'quarterfinal', d(4), d(5)),
    fm('qfb-2', 'quarterfinal', d(3), d(6)),
    fm('sf-1', 'semifinal', d(1), E),
    fm('sf-2', 'semifinal', d(2), E),
    ...tail(),
    ...extra,
  ]);
const eightStage = (): FinalStage =>
  stage([
    fm('qf-1', 'quarterfinal', d(1), d(8)),
    fm('qf-2', 'quarterfinal', d(4), d(5)),
    fm('qf-3', 'quarterfinal', d(2), d(7)),
    fm('qf-4', 'quarterfinal', d(3), d(6)),
    fm('sf-1', 'semifinal', E, E),
    fm('sf-2', 'semifinal', E, E),
    ...tail(),
  ]);
const noWinner = (): null => null;
const bySide = (m: Match): 1 | 2 | null =>
  m.scoreA === null || m.scoreB === null || !m.teamA[0] || !m.teamB[0] ? null : m.scoreA > m.scoreB ? 1 : 2;

describe('finalsBracket', () => {
  it('is null for formats without a tree and for partial stages', () => {
    expect(finalsBracket(stage(tail()), noWinner)).toBeNull();
    expect(finalsBracket(stage([fm('qf-1', 'quarterfinal', d(1), d(8)), ...tail()]), noWinner)).toBeNull();
    expect(finalsBracket(stage(byeStage().matches.filter((m) => m.id !== 'final-championship')), noWinner)).toBeNull();
  });

  it('lays out the bye bracket as 4, 2 and 1 cells with D1 and D2 as bye nodes', () => {
    const view = finalsBracket(byeStage(), noWinner)!;
    expect(view.columns.map((c) => c.length)).toEqual([4, 2, 1]);
    expect(view.columns[0].map((m) => m.id)).toEqual(['bye-1', 'final-qfb-1', 'final-qfb-2', 'bye-2']);
    const [bye1, , , bye2] = view.columns[0];
    expect(bye1).toMatchObject({ kind: 'bye', state: 'bye', winner: null });
    expect(bye1.slots[0]).toMatchObject({ kind: 'pair', playerIds: d(1), seed: 1 });
    expect(bye1.slots[1]).toEqual({ kind: 'bye' });
    expect(bye2.slots[0]).toMatchObject({ playerIds: d(2), seed: 2 });
  });

  it('seeds the bye quarterfinals D4xD5 and D3xD6', () => {
    const [, q1, q2] = finalsBracket(byeStage(), noWinner)!.columns[0];
    expect(q1.slots.map((s) => s.kind === 'pair' && s.seed)).toEqual([4, 5]);
    expect(q2.slots.map((s) => s.kind === 'pair' && s.seed)).toEqual([3, 6]);
  });

  it('shows feeds for empty slots, including the third place', () => {
    const view = finalsBracket(byeStage(), noWinner)!;
    expect(view.columns[1][0].slots[1]).toEqual({ kind: 'feed', outcome: 'winner', round: 'qf', number: 1 });
    expect(view.columns[1][1].slots[1]).toEqual({ kind: 'feed', outcome: 'winner', round: 'qf', number: 2 });
    expect(view.columns[1][0].slots[0]).toMatchObject({ kind: 'pair', seed: 1 });
    expect(view.columns[2][0].slots).toEqual([
      { kind: 'feed', outcome: 'winner', round: 'sf', number: 1 },
      { kind: 'feed', outcome: 'winner', round: 'sf', number: 2 },
    ]);
    expect(view.thirdPlace!.slots[0]).toEqual({ kind: 'feed', outcome: 'loser', round: 'sf', number: 1 });
    expect(view.columns[1][0].state).toBe('tbd');
  });

  it('seeds the eight layout 1/8, 4/5, 2/7, 3/6', () => {
    const view = finalsBracket(eightStage(), noWinner)!;
    expect(view.columns[0].map((m) => m.slots.map((s) => s.kind === 'pair' && s.seed))).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
    expect(view.columns[0].some((m) => m.kind === 'bye')).toBe(false);
    expect(view.columns[1][1].slots[0]).toEqual({ kind: 'feed', outcome: 'winner', round: 'qf', number: 3 });
  });

  it('marks the winner, advances the seed and keeps the model slot order', () => {
    const s = byeStage();
    s.matches[0] = { ...s.matches[0], scoreA: 2, scoreB: 6 };
    s.matches[2] = { ...s.matches[2], teamB: d(5) };
    const view = finalsBracket(s, bySide)!;
    const q1 = view.columns[0][1];
    expect(q1).toMatchObject({ state: 'done', winner: 2 });
    expect(q1.slots[0]).toMatchObject({ playerIds: d(4), games: 2, won: false });
    expect(q1.slots[1]).toMatchObject({ playerIds: d(5), games: 6, won: true });
    expect(view.columns[1][0]).toMatchObject({ state: 'ready' });
    expect(view.columns[1][0].slots[1]).toMatchObject({ kind: 'pair', playerIds: d(5), seed: 5 });
  });

  it('shows a tie-break only at 6-6', () => {
    const s = eightStage();
    s.matches[0] = { ...s.matches[0], scoreA: 6, scoreB: 6, tieBreakA: 7, tieBreakB: 5 };
    s.matches[1] = { ...s.matches[1], scoreA: 6, scoreB: 3, tieBreakA: 7, tieBreakB: 5 };
    const [m1, m2] = finalsBracket(s, bySide)!.columns[0];
    expect(m1.slots[0]).toMatchObject({ games: 6, tieBreak: 7 });
    expect(m1.slots[1]).toMatchObject({ games: 6, tieBreak: 5 });
    expect(m2.slots[0]).toMatchObject({ games: 6, tieBreak: null });
  });

  it('is live only for the championship in point mode with no winner', () => {
    const live = (m: Match): Match => ({ ...m, livePoints: ['A'] });
    const s = byeStage();
    const final = s.matches.findIndex((m) => m.id === 'final-championship');
    s.matches[final] = live({ ...s.matches[final], teamA: d(1), teamB: d(2) });
    s.matches[0] = live(s.matches[0]);
    expect(finalsBracket(s, noWinner)!.columns[2][0].state).toBe('live');
    expect(finalsBracket(s, noWinner)!.columns[0][1].state).toBe('ready');
    expect(finalsBracket(s, () => 1)!.columns[2][0]).toMatchObject({ state: 'done', winner: 1 });
  });

  it('leaves seed null for a pair outside the first round', () => {
    const s = eightStage();
    s.matches[4] = { ...s.matches[4], teamA: ['x', 'y'] };
    expect(finalsBracket(s, noWinner)!.columns[1][0].slots[0]).toMatchObject({ playerIds: ['x', 'y'], seed: null });
  });
});
