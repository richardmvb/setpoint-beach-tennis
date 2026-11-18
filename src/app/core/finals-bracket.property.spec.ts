import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { finalsBracket } from '../domain/tournament-view/bracket';
import type { BracketMatch, BracketView } from '../domain/tournament-view/bracket';
import { FinalsService } from './finals.service';
import type { FinalStage, PlayerStanding } from './models';

const finals = new FinalsService();
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
const pairs = Array.from({ length: 6 }, (_, i): [string, string] => [`p${i}a`, `p${i}b`]);

/** A finished set the winner rule accepts: [A, B] games, one side ahead. */
const result = fc.constantFrom<[number, number]>([6, 0], [6, 4], [4, 6], [0, 6], [7, 5], [5, 7]);
const winnerSide = (m: Parameters<FinalsService['winnerSide']>[0]) => finals.winnerSide(m);

/** Plays the stage in id order, so each round is filled before it is scored. */
function playAll(stage: FinalStage, scores: [number, number][], upTo: number): FinalStage {
  const order = ['qf-1', 'qf-2', 'qf-3', 'qf-4', 'qfb-1', 'qfb-2', 'sf-1', 'sf-2', 'championship', 'third-place'];
  let current = finals.updatePodium(stage);
  let n = 0;
  for (const id of order) {
    if (n >= upTo) break;
    const m = current.matches.find((x) => x.id === 'final-' + id);
    if (!m || !m.teamA[0] || !m.teamB[0]) continue;
    const [scoreA, scoreB] = scores[n++ % scores.length];
    current = finals.updatePodium({
      ...current,
      matches: current.matches.map((x) => (x === m ? { ...x, scoreA, scoreB } : x)),
    });
  }
  return current;
}

const all = (view: BracketView): BracketMatch[] => [
  ...view.columns.flat(),
  ...(view.thirdPlace ? [view.thirdPlace] : []),
];
const idsOf = (m: BracketMatch): string[] => m.slots.flatMap((s) => (s.kind === 'pair' ? [s.playerIds.join('|')] : []));

describe('finalsBracket, for any results', () => {
  const stages: [string, () => FinalStage, number][] = [
    ['bye', () => finals.createByeBracket(pairs), 2],
    ['eight', () => finals.createMixedBracket(men, women), 0],
  ];
  for (const [name, make, byes] of stages) {
    it(`${name}: every id once, ${byes} bye nodes, unique seeds per column, winners advance`, () => {
      fc.assert(
        fc.property(
          fc.array(result, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (scores, upTo) => {
            const stage = playAll(make(), scores, upTo);
            const view = finalsBracket(stage, winnerSide)!;
            const ids = all(view).map((m) => m.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(ids.filter((id) => !id.startsWith('bye-')).sort()).toEqual(stage.matches.map((m) => m.id).sort());
            expect(all(view).filter((m) => m.kind === 'bye')).toHaveLength(byes);
            for (const column of view.columns) {
              const seeds = column.flatMap((m) =>
                m.slots.flatMap((s) => (s.kind === 'pair' && s.seed ? [s.seed] : [])),
              );
              expect(new Set(seeds).size).toBe(seeds.length);
            }
            // A winner of a done match is in the next round, or that slot still shows its feed.
            const next = (round: BracketMatch[]): string[] => round.flatMap(idsOf);
            for (let c = 0; c < 2; c++) {
              const later = next(view.columns[c + 1]);
              for (const m of view.columns[c].filter((x) => x.state === 'done')) {
                const side = m.slots[(m.winner as 1 | 2) - 1];
                if (side.kind === 'pair') expect(later).toContain(side.playerIds.join('|'));
              }
            }
          },
        ),
        { numRuns: 60 },
      );
    });
  }
});
