import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { calculateFinalLiveScore, finalLiveMatchScore, type FinalLivePoint } from './final-live-score';
import { FinalsService } from './finals.service';
import type { FinalMatchKind, FinalStage, Match, PlayerStanding, TournamentState } from './models';
import { ShareCardService } from './share-card.service';
import { StorageService } from './storage.service';

/** A point sequence from a string of 'A' and 'B'. */
function sequence(text: string): FinalLivePoint[] {
  return [...text] as FinalLivePoint[];
}
function game(points: FinalLivePoint[], side: FinalLivePoint): void {
  points.push(...Array<FinalLivePoint>(4).fill(side));
}
function tiedSet(): FinalLivePoint[] {
  const points: FinalLivePoint[] = [];
  for (let index = 0; index < 12; index++) game(points, index % 2 ? 'B' : 'A');
  return points;
}
function standing(playerId: string): PlayerStanding {
  return {
    playerId,
    name: playerId,
    setsWon: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameBalance: 0,
    rests: 0,
    matchesPlayed: 0,
  };
}
function finalMatch(stage: FinalStage, kind: FinalMatchKind): Match {
  const match = stage.matches.find((item) => item.finalKind === kind);
  if (!match) throw new Error(`Final sem partida ${kind}.`);
  return match;
}
/** Results come from the private `playerResults`; a typed view keeps the test honest about what it calls. */
function finalResult(cards: ShareCardService, state: TournamentState, playerId: string) {
  const view = cards as unknown as {
    playerResults(state: TournamentState, playerId: string): { label: string; won: boolean | null; score: string }[];
  };
  return view.playerResults(state, playerId).find((result) => result.label === 'Final');
}
function fixture(): { service: FinalsService; state: TournamentState & { finals: FinalStage } } {
  const players = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, name: `Jogador ${index}` }));
  const service = TestBed.inject(FinalsService);
  return {
    service,
    state: {
      version: 1,
      name: 'Final',
      size: 8,
      courts: 2,
      gamesToWin: 4,
      roundCount: 7,
      createdAt: '2026-11-08T10:00:00Z',
      players,
      rounds: [],
      finals: service.create(players.map((player) => standing(player.id))),
    },
  };
}

describe('final live score', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('40–40 é ponto decisivo sem vantagem', () => {
    const points = sequence('AAABBB');
    expect(calculateFinalLiveScore(points).pointsA).toBe('40');
    expect(calculateFinalLiveScore(points).pointsB).toBe('40');
    const score = calculateFinalLiveScore([...points, 'B']);
    expect(score.gamesA).toBe(0);
    expect(score.gamesB).toBe(1);
    expect(score.pointsA).toBe('0');
    expect(score.pointsB).toBe('0');
  });

  it('set termina em 6–4 ou 7–5, sem encerrar em 6–5', () => {
    const points: FinalLivePoint[] = [];
    for (let index = 0; index < 10; index++) game(points, index % 2 ? 'B' : 'A');
    game(points, 'A');
    expect(calculateFinalLiveScore(points).winner).toBe(null);
    expect(calculateFinalLiveScore(points).gamesA).toBe(6);
    game(points, 'A');
    expect(calculateFinalLiveScore(points).winner).toBe(1);
    expect(finalLiveMatchScore(calculateFinalLiveScore(points))).toStrictEqual({
      scoreA: 7,
      scoreB: 5,
      tieBreakA: null,
      tieBreakB: null,
    });
    const sixFour: FinalLivePoint[] = [];
    for (let index = 0; index < 4; index++) {
      game(sixFour, 'A');
      game(sixFour, 'B');
    }
    game(sixFour, 'A');
    game(sixFour, 'A');
    expect(calculateFinalLiveScore(sixFour).winner).toBe(1);
    expect(calculateFinalLiveScore(sixFour).gamesA).toBe(6);
    expect(() => calculateFinalLiveScore([...sixFour, 'A'])).toThrow(/inválida/);
  });

  it('tie-break em 6–6 exige sete pontos e dois de diferença, inclusive ao desfazer', () => {
    const points = tiedSet();
    let score = calculateFinalLiveScore(points);
    expect(score.tieBreak).toBe(true);
    expect(score.gamesA).toBe(6);
    expect(score.gamesB).toBe(6);
    points.push(...sequence('ABABABABABAB'));
    score = calculateFinalLiveScore(points);
    expect(score.winner).toBe(null);
    expect(score.tieBreakA).toBe(6);
    expect(score.tieBreakB).toBe(6);
    points.push('A', 'A');
    score = calculateFinalLiveScore(points);
    expect(score.winner).toBe(1);
    expect(finalLiveMatchScore(score)).toStrictEqual({ scoreA: 7, scoreB: 6, tieBreakA: 8, tieBreakB: 6 });
    expect(calculateFinalLiveScore(points.slice(0, -1)).winner).toBe(null);
    expect(calculateFinalLiveScore(points.slice(0, -1)).tieBreakA).toBe(7);
    expect(() => calculateFinalLiveScore([...points, 'B'])).toThrow(/inválida/);
  });

  it('a dupla 2 pode vencer o tie-break e desfazer reabre o set', () => {
    const points = tiedSet();
    points.push(...sequence('ABABABABABABBB'));
    const score = calculateFinalLiveScore(points);
    expect(score.winner).toBe(2);
    expect(finalLiveMatchScore(score)).toStrictEqual({ scoreA: 6, scoreB: 7, tieBreakA: 6, tieBreakB: 8 });
    expect(calculateFinalLiveScore(points.slice(0, -1)).winner).toBe(null);
    expect(() => calculateFinalLiveScore(sequence('X'))).toThrow(/inválida/);
  });

  it('o pódio exige a final e o terceiro lugar, sem alterar a disputa de terceiro', () => {
    const { service, state } = fixture();
    const championship = finalMatch(state.finals, 'championship');
    const third = finalMatch(state.finals, 'third-place');
    const points = tiedSet();
    points.push(...sequence('ABABABABABABAA'));
    championship.livePoints = points;
    Object.assign(championship, finalLiveMatchScore(calculateFinalLiveScore(points)));
    expect(service.winnerSide(championship)).toBe(1);
    expect(service.updatePodium(state.finals).complete).toBe(false);
    third.scoreA = 4;
    third.scoreB = 6;
    const final = service.updatePodium(state.finals);
    expect(final.complete).toBe(true);
    expect(service.winnerSide(third)).toBe(2);
    expect(finalMatch(final, 'third-place').livePoints).toBeUndefined();
    expect(final.podiumPlayerIds.slice(0, 2)).toStrictEqual(championship.teamA);
    state.finals = final;
    const cards = TestBed.inject(ShareCardService);
    const winner = finalResult(cards, state, championship.teamA[0]);
    const runnerUp = finalResult(cards, state, championship.teamB[0]);
    expect(winner?.won).toBe(true);
    expect(runnerUp?.won).toBe(false);
    expect(winner?.score).toMatch(/7 × 6 \(8–6\)/);
  });

  it('backup preserva o ponto a ponto e rejeita histórico inconsistente ou na disputa de terceiro', () => {
    const { state } = fixture();
    const championship = finalMatch(state.finals, 'championship');
    const livePoints = sequence('AAABBB');
    championship.livePoints = livePoints;
    Object.assign(championship, finalLiveMatchScore(calculateFinalLiveScore(livePoints)));
    const storage = TestBed.inject(StorageService);
    const parsed = storage.parseTournament(JSON.stringify(state));
    expect(parsed?.finals?.matches[0].livePoints).toStrictEqual(livePoints);
    const invalid = structuredClone(state);
    invalid.finals.matches[0].scoreA = 6;
    expect(storage.parseTournament(JSON.stringify(invalid))).toBeNull();
    const third = structuredClone(state);
    third.finals.matches[1].livePoints = [];
    expect(storage.parseTournament(JSON.stringify(third))).toBeNull();
    const afterWinner = structuredClone(state);
    const complete = tiedSet();
    complete.push(...sequence('AAAAAAAA'));
    afterWinner.finals.matches[0].livePoints = complete;
    expect(storage.parseTournament(JSON.stringify(afterWinner))).toBeNull();
    const longTie = tiedSet();
    for (let index = 0; index < 99; index++) longTie.push('A', 'B');
    longTie.push('A', 'A');
    championship.livePoints = longTie;
    Object.assign(championship, finalLiveMatchScore(calculateFinalLiveScore(longTie)));
    expect(championship.tieBreakA).toBe(101);
    expect(storage.parseTournament(JSON.stringify(state))).toBeTruthy();
  });

  it('alterar as semifinais limpa os pontos de uma final com outras duplas', () => {
    const { service } = fixture();
    const men = Array.from({ length: 8 }, (_, index) => standing(`m${index}`));
    const women = Array.from({ length: 8 }, (_, index) => standing(`w${index}`));
    const stage = service.createMixedBracket(men, women);
    const championship = finalMatch(stage, 'championship');
    championship.teamA = ['m0', 'w0'];
    championship.teamB = ['m1', 'w1'];
    championship.livePoints = ['A'];
    championship.scoreA = 0;
    championship.scoreB = 0;
    const updated = finalMatch(service.updatePodium(stage), 'championship');
    expect(updated.livePoints).toBeUndefined();
    expect(updated.scoreA).toBeNull();
    expect(updated.scoreB).toBeNull();
  });
});
