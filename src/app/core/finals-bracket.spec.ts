import { describe, expect, it } from 'vitest';
import { finalsBracket } from '../domain/tournament-view/bracket';
import type { FinalStage, Match, PlayerStanding } from './models';
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

const standing = (playerId: string): PlayerStanding => ({
  playerId,
  name: playerId,
  setsWon: 0,
  gamesFor: 0,
  gamesAgainst: 0,
  gameBalance: 0,
  rests: 0,
  matchesPlayed: 0,
});
const men = Array.from({ length: 8 }, (_, i) => standing(`m${i + 1}`));
const women = Array.from({ length: 8 }, (_, i) => standing(`w${i + 1}`));
const winnerSide = (m: Match) => finals.winnerSide(m);

describe('finalsBracket over the real finals', () => {
  it('draws the bye bracket from createByeBracket and follows the results', () => {
    let stage = finals.updatePodium(finals.createByeBracket(pairs));
    let view = finalsBracket(stage, winnerSide)!;
    expect(view.columns.map((c) => c.length)).toEqual([4, 2, 1]);
    expect(view.columns[0].filter((m) => m.kind === 'bye')).toHaveLength(2);
    stage = play(stage, 'final-qfb-1', 6, 2);
    view = finalsBracket(stage, winnerSide)!;
    expect(view.columns[0][1]).toMatchObject({ id: 'final-qfb-1', state: 'done', winner: 1 });
    expect(view.columns[1][0].slots[1]).toMatchObject({ kind: 'pair', playerIds: pairs[3], seed: 4 });
    expect(view.columns[1][1].slots[1]).toMatchObject({ kind: 'feed', number: 2 });
  });

  it('draws the eight layout from createMixedBracket', () => {
    const view = finalsBracket(finals.createMixedBracket(men, women), winnerSide)!;
    expect(view.columns.map((c) => c.length)).toEqual([4, 2, 1]);
    expect(view.columns[0].map((m) => m.id)).toEqual(['final-qf-1', 'final-qf-2', 'final-qf-3', 'final-qf-4']);
    expect(view.columns[0][0].slots[1]).toMatchObject({ playerIds: ['m8', 'w8'], seed: 8 });
    expect(view.thirdPlace).not.toBeNull();
  });

  it('has no tree for Super or mixed direct', () => {
    expect(finalsBracket(finals.create(men), winnerSide)).toBeNull();
    expect(finalsBracket(finals.createMixedDirect(men, women), winnerSide)).toBeNull();
  });

  it('is live for a championship scored point by point and done once someone wins', () => {
    let stage = finals.updatePodium(finals.createByeBracket(pairs));
    for (const [id, a, b] of [
      ['final-qfb-1', 6, 2],
      ['final-qfb-2', 6, 3],
      ['final-sf-1', 6, 4],
      ['final-sf-2', 6, 4],
    ] as const)
      stage = play(stage, id, a, b);
    const withPoints = (points: ('A' | 'B')[]): FinalStage => ({
      ...stage,
      matches: stage.matches.map((m) => (m.id === 'final-championship' ? { ...m, livePoints: points } : m)),
    });
    expect(finalsBracket(withPoints(['A']), winnerSide)!.columns[2][0].state).toBe('live');
    const won = finalsBracket(withPoints(Array.from({ length: 24 }, (): 'A' => 'A')), winnerSide)!.columns[2][0];
    expect(won.state).toBe('done');
    expect(won.slots[0]).toMatchObject({ won: true });
  });
});
