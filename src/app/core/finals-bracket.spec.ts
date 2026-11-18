import { describe, expect, it } from 'vitest';
import type { FinalStage, Match } from './models';
import { FinalsService } from './finals.service';

const pairs: [string, string][] = [
  ['a1', 'a2'],
  ['b1', 'b2'],
  ['c1', 'c2'],
  ['d1', 'd2'],
  ['e1', 'e2'],
  ['f1', 'f2'],
];
const finals = new FinalsService();

function play(stage: FinalStage, id: string, scoreA: number, scoreB: number): FinalStage {
  const matches = stage.matches.map((m): Match => (m.id === id ? { ...m, scoreA, scoreB } : m));
  return finals.updatePodium({ ...stage, matches });
}
const byId = (stage: FinalStage, id: string): Match => stage.matches.find((m) => m.id === id)!;

describe('createByeBracket', () => {
  it('puts D1 and D2 in the semifinals and plays D4 x D5 and D3 x D6 first', () => {
    const stage = finals.createByeBracket(pairs);
    expect(stage.matches).toHaveLength(6);
    expect(byId(stage, 'final-qfb-1')).toMatchObject({ teamA: pairs[3], teamB: pairs[4], finalKind: 'quarterfinal' });
    expect(byId(stage, 'final-qfb-2')).toMatchObject({ teamA: pairs[2], teamB: pairs[5] });
    expect(byId(stage, 'final-sf-1')).toMatchObject({ teamA: pairs[0], teamB: ['', ''] });
    expect(byId(stage, 'final-sf-2')).toMatchObject({ teamA: pairs[1], teamB: ['', ''] });
  });

  it('needs six pairs', () => {
    expect(() => finals.createByeBracket(pairs.slice(0, 5))).toThrow();
  });

  it('fills each semifinal opponent from its quarterfinal, then the final and the third place, then the podium', () => {
    let stage = finals.updatePodium(finals.createByeBracket(pairs));
    stage = play(stage, 'final-qfb-1', 6, 2);
    expect(byId(stage, 'final-sf-1')).toMatchObject({ teamA: pairs[0], teamB: pairs[3] });
    expect(byId(stage, 'final-sf-2').teamB).toEqual(['', '']);
    stage = play(stage, 'final-qfb-2', 3, 6);
    expect(byId(stage, 'final-sf-2')).toMatchObject({ teamA: pairs[1], teamB: pairs[5] });
    stage = play(stage, 'final-sf-1', 6, 4);
    stage = play(stage, 'final-sf-2', 2, 6);
    expect(byId(stage, 'final-championship')).toMatchObject({ teamA: pairs[0], teamB: pairs[5] });
    expect(byId(stage, 'final-third-place')).toMatchObject({ teamA: pairs[3], teamB: pairs[1] });
    stage = play(stage, 'final-championship', 6, 3);
    stage = play(stage, 'final-third-place', 4, 6);
    expect(stage.complete).toBe(true);
    expect(stage.podiumPlayerIds).toEqual([...pairs[0], ...pairs[5], ...pairs[1], ...pairs[3]]);
    expect(finals.podium(stage).map((place) => place.playerIds)).toEqual([pairs[0], pairs[5], pairs[1], pairs[3]]);
  });

  it('clears a semifinal score when its quarterfinal result changes', () => {
    let stage = finals.updatePodium(finals.createByeBracket(pairs));
    stage = play(stage, 'final-qfb-1', 6, 2);
    stage = play(stage, 'final-sf-1', 6, 4);
    stage = play(stage, 'final-qfb-1', 2, 6);
    expect(byId(stage, 'final-sf-1')).toMatchObject({ teamA: pairs[0], teamB: pairs[4], scoreA: null, scoreB: null });
  });
});
