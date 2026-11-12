import { describe, it, expect } from 'vitest';
import { projectScenarios, tieValue, type EngineMatch, type EnginePlayer } from './scenario-engine';
import { ScheduleService } from './schedule.service';
import type { RandomSource } from './schedule-shuffle';

const goals = [1, 2, 3] as const;

let seed = 99;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
// The schedule shuffle defaults to Math.random. Seed it too, or each run starts from a different tournament and
// the "covers both states" check below can fail by chance.
let scheduleSeed = 7;
const scheduleRandom: RandomSource = () =>
  (scheduleSeed = (scheduleSeed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'];
const players = names.map((name, i) => ({ id: `p${i}`, name }));

/** A real Super 8 schedule with the first `played` rounds scored at random. */
function scenario(played: number): { enginePlayers: EnginePlayer[]; open: EngineMatch[] } {
  const schedule = new ScheduleService();
  schedule.random = scheduleRandom;
  const rounds = schedule.generate(players, 8, 2, 7, false);
  const wins = new Map(players.map((p) => [p.id, 0]));
  const open: EngineMatch[] = [];
  rounds.forEach((round, ri) =>
    round.matches.forEach((match) => {
      if (ri < played) {
        const aWins = random() < 0.5;
        (aWins ? match.teamA : match.teamB).forEach((id) => wins.set(id, (wins.get(id) ?? 0) + 1));
      } else open.push({ id: match.id, round: round.number, teamA: match.teamA, teamB: match.teamB });
    }),
  );
  return { enginePlayers: players.map((p) => ({ id: p.id, wins: wins.get(p.id) ?? 0 })), open };
}

/** Independent brute force (plain nested enumeration, no Gray code, no shared code with the engine). */
function brute(
  enginePlayers: EnginePlayer[],
  open: EngineMatch[],
  me: string,
  forced: Readonly<Record<string, 'A' | 'B'>> = {},
) {
  const base: Record<string, number> = Object.fromEntries(enginePlayers.map((p) => [p.id, p.wins]));
  const free: EngineMatch[] = [];
  for (const m of open) {
    if (forced[m.id])
      (forced[m.id] === 'A' ? m.teamA : m.teamB).forEach((id) => {
        base[id]++;
      });
    else free.push(m);
  }
  const goalP: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  let best = 99,
    worst = 0,
    count = 0;
  const places = new Array<number>(enginePlayers.length).fill(0);
  for (let mask = 0; mask < 2 ** free.length; mask++) {
    const w = { ...base };
    free.forEach((m, i) =>
      ((mask >> i) & 1 ? m.teamA : m.teamB).forEach((id) => {
        w[id]++;
      }),
    );
    let s = 0,
      t = 0;
    for (const p of enginePlayers)
      if (p.id !== me) {
        if (w[p.id] > w[me]) s++;
        else if (w[p.id] === w[me]) t++;
      }
    count++;
    best = Math.min(best, s + 1);
    worst = Math.max(worst, s + t + 1);
    for (const g of goals) goalP[g] += s + 1 > g ? 0 : s + t + 1 <= g ? 1 : (g - s) / (t + 1);
    for (let k = s; k <= s + t; k++) places[k] += 1 / (t + 1);
  }
  return {
    goalP: Object.fromEntries(Object.entries(goalP).map(([g, v]) => [g, v / count])),
    best,
    worst,
    places: places.map((v) => v / count),
    count,
  };
}

describe('scenario-engine', () => {
  it('empate em vitórias é dividido igualmente entre os empatados', () => {
    expect(tieValue(0, 0, 1)).toBe(1);
    expect(tieValue(1, 0, 1)).toBe(0);
    expect(tieValue(2, 1, 3)).toBe(0.5);
    expect(tieValue(2, 0, 3)).toBe(1);
    expect(tieValue(2, 2, 3)).toBe(1 / 3);
    expect(tieValue(0, 3, 2)).toBe(0.5);
  });

  it('o modo exato coincide com a força bruta independente (chances, faixa de colocação e distribuição)', () => {
    for (const played of [2, 3, 4, 5])
      for (let trial = 0; trial < 6; trial++) {
        const { enginePlayers, open } = scenario(played);
        for (const me of ['p0', 'p3', 'p6']) {
          const result = projectScenarios(enginePlayers, open, me);
          const expected = brute(enginePlayers, open, me);
          expect(result.mode).toBe('exact');
          expect(result.futures).toBe(expected.count);
          for (const g of goals)
            expect(Math.abs(result.goals[g].probability - expected.goalP[g]), `meta ${g}`).toBeLessThan(1e-9);
          expect(result.bestPlace).toBe(expected.best);
          expect(result.worstPlace).toBe(expected.worst);
          result.placeDistribution.forEach((p, k) => expect(Math.abs(p - expected.places[k])).toBeLessThan(1e-9));
        }
      }
  });

  it('garantido e eliminado seguem exatamente a colocação melhor e pior possíveis', () => {
    let clinched = 0,
      eliminated = 0;
    for (let trial = 0; trial < 30; trial++) {
      const { enginePlayers, open } = scenario(5);
      for (const p of enginePlayers) {
        const result = projectScenarios(enginePlayers, open, p.id);
        const expected = brute(enginePlayers, open, p.id);
        for (const g of goals) {
          const goal = result.goals[g];
          expect(goal.status === 'clinched').toBe(expected.worst <= g);
          expect(goal.status === 'eliminated').toBe(expected.best > g);
          if (goal.status === 'clinched') {
            expect(goal.probability).toBe(1);
            clinched++;
          }
          if (goal.status === 'eliminated') {
            expect(goal.probability).toBe(0);
            eliminated++;
          }
        }
      }
    }
    expect(clinched > 0 && eliminated > 0, 'o teste precisa cobrir os dois estados').toBeTruthy();
  });

  it('as probabilidades por número de vitórias são crescentes e a soma das posições é 1', () => {
    const { enginePlayers, open } = scenario(3);
    const result = projectScenarios(enginePlayers, open, 'p2');
    expect(Math.abs(result.placeDistribution.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
    for (const g of goals) {
      const table = result.goals[g].byMyWins;
      for (let i = 1; i < table.length; i++)
        expect(table[i].probability).toBeGreaterThanOrEqual(table[i - 1].probability - 1e-9);
    }
    expect(result.expectedPlace >= 1 && result.expectedPlace <= 8).toBeTruthy();
  });

  it('ganhar o próprio jogo nunca piora a chance e parceiros ganham e perdem juntos', () => {
    const { enginePlayers, open } = scenario(3);
    const result = projectScenarios(enginePlayers, open, 'p1');
    for (const g of goals)
      for (const impact of result.goals[g].matchImpacts.filter((item) => item.mine)) {
        const iAmOnA = impact.teamA.includes('p1');
        const myWin = iAmOnA ? impact.ifAWins : impact.ifBWins;
        const myLoss = iAmOnA ? impact.ifBWins : impact.ifAWins;
        expect(myWin, 'vencer o próprio jogo nunca pode reduzir a chance').toBeGreaterThanOrEqual(myLoss - 1e-9);
      }
    // two partners on one match: their results are the same event
    const duo = projectScenarios(
      [
        { id: 'a', wins: 0 },
        { id: 'b', wins: 0 },
        { id: 'c', wins: 0 },
        { id: 'd', wins: 0 },
      ],
      [{ id: 'm', round: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] }],
      'a',
    );
    expect(
      Math.abs(duo.goals[1].probability - (0.5 * (1 / 2) + 0.5 * 0)),
      'se vence, empata com o parceiro: 1/2 de ser 1º',
    ).toBeLessThan(1e-9);
  });

  it('resultados assumidos (E se?) coincidem com a força bruta e reduzem os futuros', () => {
    const { enginePlayers, open } = scenario(3);
    const forced: Record<string, 'A' | 'B'> = { [open[0].id]: 'A', [open[1].id]: 'B' };
    const result = projectScenarios(enginePlayers, open, 'p4', { forced });
    const expected = brute(enginePlayers, open, 'p4', forced);
    expect(result.futures).toBe(expected.count);
    expect(result.openMatches).toBe(open.length - 2);
    for (const g of goals) expect(Math.abs(result.goals[g].probability - expected.goalP[g])).toBeLessThan(1e-9);
  });

  it('a simulação (muitos jogos em aberto) fica perto do exato e é determinística', () => {
    const { enginePlayers, open } = scenario(3);
    const exact = projectScenarios(enginePlayers, open, 'p5');
    const sampled = projectScenarios(enginePlayers, open, 'p5', { exactLimit: 0, simulations: 40000, seed: 7 });
    const again = projectScenarios(enginePlayers, open, 'p5', { exactLimit: 0, simulations: 40000, seed: 7 });
    expect(sampled.mode).toBe('simulated');
    for (const g of goals) {
      expect(Math.abs(sampled.goals[g].probability - exact.goals[g].probability), `meta ${g}`).toBeLessThan(0.02);
      expect(sampled.goals[g].probability).toBe(again.goals[g].probability);
    }
    // sampled statuses come only from sound bounds, never from the samples
    for (const g of goals) {
      if (sampled.goals[g].status === 'clinched') expect(exact.goals[g].status).toBe('clinched');
      if (sampled.goals[g].status === 'eliminated') expect(exact.goals[g].status).toBe('eliminated');
    }
  });

  it('os rivais a acompanhar ficam fora dos jogos do próprio atleta e têm ganho positivo', () => {
    const { enginePlayers, open } = scenario(3);
    const result = projectScenarios(enginePlayers, open, 'p0');
    for (const g of goals)
      for (const rival of result.goals[g].rivals) {
        expect(rival.playerId).not.toBe('p0');
        expect(rival.totalGain > 0 && rival.gainPerLoss > 0).toBeTruthy();
      }
  });

  it('torneio sem jogos em aberto resolve de forma determinística', () => {
    const result = projectScenarios(
      [
        { id: 'a', wins: 3 },
        { id: 'b', wins: 2 },
        { id: 'c', wins: 2 },
        { id: 'd', wins: 0 },
      ],
      [],
      'b',
    );
    expect(result.futures).toBe(1);
    expect(result.goals[1].status).toBe('eliminated');
    expect(result.goals[3].status).toBe('clinched');
    expect(Math.abs(result.goals[2].probability - 0.5)).toBeLessThan(1e-9);
  });
});
