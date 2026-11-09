const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const stub = { '@angular/core': { Injectable: () => target => target } };
const { projectScenarios, tieValue } = loadCore('scenario-engine');
const { ScheduleService } = loadCore('schedule.service', stub);

let seed = 99;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'];
const players = names.map((name, i) => ({ id: `p${i}`, name }));

/** A real Super 8 schedule with the first `played` rounds scored at random. */
function scenario(played) {
  const rounds = new ScheduleService().generate(players, 8, 2, 7, false);
  const wins = new Map(players.map(p => [p.id, 0]));
  const open = [];
  rounds.forEach((round, ri) => round.matches.forEach(match => {
    if (ri < played) {
      const aWins = random() < 0.5;
      (aWins ? match.teamA : match.teamB).forEach(id => wins.set(id, wins.get(id) + 1));
    } else open.push({ id: match.id, round: round.number, teamA: match.teamA, teamB: match.teamB });
  }));
  return { enginePlayers: players.map(p => ({ id: p.id, wins: wins.get(p.id) })), open };
}

/** Independent brute force (plain nested enumeration, no Gray code, no shared code with the engine). */
function brute(enginePlayers, open, me, forced = {}) {
  const base = Object.fromEntries(enginePlayers.map(p => [p.id, p.wins]));
  const free = [];
  for (const m of open) {
    if (forced[m.id]) (forced[m.id] === 'A' ? m.teamA : m.teamB).forEach(id => { base[id]++; });
    else free.push(m);
  }
  const goalP = { 1: 0, 2: 0, 3: 0 };
  let best = 99, worst = 0, count = 0;
  const places = new Array(enginePlayers.length).fill(0);
  for (let mask = 0; mask < 2 ** free.length; mask++) {
    const w = { ...base };
    free.forEach((m, i) => ((mask >> i) & 1 ? m.teamA : m.teamB).forEach(id => { w[id]++; }));
    let s = 0, t = 0;
    for (const p of enginePlayers) if (p.id !== me) { if (w[p.id] > w[me]) s++; else if (w[p.id] === w[me]) t++; }
    count++;
    best = Math.min(best, s + 1); worst = Math.max(worst, s + t + 1);
    for (const g of [1, 2, 3]) goalP[g] += s + 1 > g ? 0 : s + t + 1 <= g ? 1 : (g - s) / (t + 1);
    for (let k = s; k <= s + t; k++) places[k] += 1 / (t + 1);
  }
  return { goalP: Object.fromEntries(Object.entries(goalP).map(([g, v]) => [g, v / count])), best, worst, places: places.map(v => v / count), count };
}

test('empate em vitórias é dividido igualmente entre os empatados', () => {
  assert.equal(tieValue(0, 0, 1), 1);
  assert.equal(tieValue(1, 0, 1), 0);
  assert.equal(tieValue(2, 1, 3), 0.5);
  assert.equal(tieValue(2, 0, 3), 1);
  assert.equal(tieValue(2, 2, 3), 1 / 3);
  assert.equal(tieValue(0, 3, 2), 0.5);
});

test('o modo exato coincide com a força bruta independente (chances, faixa de colocação e distribuição)', () => {
  for (const played of [2, 3, 4, 5]) for (let trial = 0; trial < 6; trial++) {
    const { enginePlayers, open } = scenario(played);
    for (const me of ['p0', 'p3', 'p6']) {
      const result = projectScenarios(enginePlayers, open, me);
      const expected = brute(enginePlayers, open, me);
      assert.equal(result.mode, 'exact');
      assert.equal(result.futures, expected.count);
      for (const g of [1, 2, 3]) assert.ok(Math.abs(result.goals[g].probability - expected.goalP[g]) < 1e-9, `meta ${g}`);
      assert.equal(result.bestPlace, expected.best);
      assert.equal(result.worstPlace, expected.worst);
      result.placeDistribution.forEach((p, k) => assert.ok(Math.abs(p - expected.places[k]) < 1e-9));
    }
  }
});

test('garantido e eliminado seguem exatamente a colocação melhor e pior possíveis', () => {
  let clinched = 0, eliminated = 0;
  for (let trial = 0; trial < 30; trial++) {
    const { enginePlayers, open } = scenario(5);
    for (const p of enginePlayers) {
      const result = projectScenarios(enginePlayers, open, p.id);
      const expected = brute(enginePlayers, open, p.id);
      for (const g of [1, 2, 3]) {
        const goal = result.goals[g];
        assert.equal(goal.status === 'clinched', expected.worst <= g);
        assert.equal(goal.status === 'eliminated', expected.best > g);
        if (goal.status === 'clinched') { assert.equal(goal.probability, 1); clinched++; }
        if (goal.status === 'eliminated') { assert.equal(goal.probability, 0); eliminated++; }
      }
    }
  }
  assert.ok(clinched > 0 && eliminated > 0, 'o teste precisa cobrir os dois estados');
});

test('as probabilidades por número de vitórias são crescentes e a soma das posições é 1', () => {
  const { enginePlayers, open } = scenario(3);
  const result = projectScenarios(enginePlayers, open, 'p2');
  assert.ok(Math.abs(result.placeDistribution.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (const g of [1, 2, 3]) {
    const table = result.goals[g].byMyWins;
    for (let i = 1; i < table.length; i++) assert.ok(table[i].probability >= table[i - 1].probability - 1e-9);
  }
  assert.ok(result.expectedPlace >= 1 && result.expectedPlace <= 8);
});

test('ganhar o próprio jogo nunca piora a chance e parceiros ganham e perdem juntos', () => {
  const { enginePlayers, open } = scenario(3);
  const result = projectScenarios(enginePlayers, open, 'p1');
  for (const g of [1, 2, 3]) for (const impact of result.goals[g].matchImpacts.filter(item => item.mine)) {
    const iAmOnA = impact.teamA.includes('p1');
    const myWin = iAmOnA ? impact.ifAWins : impact.ifBWins;
    const myLoss = iAmOnA ? impact.ifBWins : impact.ifAWins;
    assert.ok(myWin >= myLoss - 1e-9, 'vencer o próprio jogo nunca pode reduzir a chance');
  }
  // two partners on one match: their results are the same event
  const duo = projectScenarios([{ id: 'a', wins: 0 }, { id: 'b', wins: 0 }, { id: 'c', wins: 0 }, { id: 'd', wins: 0 }],
    [{ id: 'm', round: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] }], 'a');
  assert.ok(Math.abs(duo.goals[1].probability - (0.5 * (1 / 2) + 0.5 * 0)) < 1e-9, 'se vence, empata com o parceiro: 1/2 de ser 1º');
});

test('resultados assumidos (E se?) coincidem com a força bruta e reduzem os futuros', () => {
  const { enginePlayers, open } = scenario(3);
  const forced = { [open[0].id]: 'A', [open[1].id]: 'B' };
  const result = projectScenarios(enginePlayers, open, 'p4', { forced });
  const expected = brute(enginePlayers, open, 'p4', forced);
  assert.equal(result.futures, expected.count);
  assert.equal(result.openMatches, open.length - 2);
  for (const g of [1, 2, 3]) assert.ok(Math.abs(result.goals[g].probability - expected.goalP[g]) < 1e-9);
});

test('a simulação (muitos jogos em aberto) fica perto do exato e é determinística', () => {
  const { enginePlayers, open } = scenario(3);
  const exact = projectScenarios(enginePlayers, open, 'p5');
  const sampled = projectScenarios(enginePlayers, open, 'p5', { exactLimit: 0, simulations: 40000, seed: 7 });
  const again = projectScenarios(enginePlayers, open, 'p5', { exactLimit: 0, simulations: 40000, seed: 7 });
  assert.equal(sampled.mode, 'simulated');
  for (const g of [1, 2, 3]) {
    assert.ok(Math.abs(sampled.goals[g].probability - exact.goals[g].probability) < 0.02, `meta ${g}`);
    assert.equal(sampled.goals[g].probability, again.goals[g].probability);
  }
  // sampled statuses come only from sound bounds, never from the samples
  for (const g of [1, 2, 3]) {
    if (sampled.goals[g].status === 'clinched') assert.equal(exact.goals[g].status, 'clinched');
    if (sampled.goals[g].status === 'eliminated') assert.equal(exact.goals[g].status, 'eliminated');
  }
});

test('os rivais a acompanhar ficam fora dos jogos do próprio atleta e têm ganho positivo', () => {
  const { enginePlayers, open } = scenario(3);
  const result = projectScenarios(enginePlayers, open, 'p0');
  for (const g of [1, 2, 3]) for (const rival of result.goals[g].rivals) {
    assert.notEqual(rival.playerId, 'p0');
    assert.ok(rival.totalGain > 0 && rival.gainPerLoss > 0);
  }
});

test('torneio sem jogos em aberto resolve de forma determinística', () => {
  const result = projectScenarios([{ id: 'a', wins: 3 }, { id: 'b', wins: 2 }, { id: 'c', wins: 2 }, { id: 'd', wins: 0 }], [], 'b');
  assert.equal(result.futures, 1);
  assert.equal(result.goals[1].status, 'eliminated');
  assert.equal(result.goals[3].status, 'clinched');
  assert.ok(Math.abs(result.goals[2].probability - 0.5) < 1e-9);
});
