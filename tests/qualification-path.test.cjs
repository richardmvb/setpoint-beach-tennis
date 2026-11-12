const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const stub = { '@angular/core': { Injectable: () => (target) => target } };
const { QualificationService } = loadCore('qualification.service', stub);
const { ScheduleService } = loadCore('schedule.service', stub);
const service = new QualificationService();

const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'];
const players = names.map((name, i) => ({ id: `p${i}`, name }));
let seed = 5;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function build(playedRounds, partial = 0) {
  const rounds = new ScheduleService().generate(players, 8, 2, 7, false);
  rounds.forEach((round, ri) =>
    round.matches.forEach((match, mi) => {
      const played = ri < playedRounds || (ri === playedRounds && mi < partial);
      if (played) {
        const aWins = random() < 0.5;
        const loser = Math.floor(random() * 4);
        match.scoreA = aWins ? 4 : loser;
        match.scoreB = aWins ? loser : 4;
      } else {
        match.scoreA = null;
        match.scoreB = null;
      }
    }),
  );
  const state = {
    version: 1,
    name: 't',
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players,
    rounds,
    createdAt: '',
    tournamentMode: 'super',
  };
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    setsWon: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameBalance: 0,
    rests: 0,
    matchesPlayed: 0,
  }));
  const by = new Map(rows.map((r) => [r.playerId, r]));
  for (const r of rounds)
    for (const m of r.matches) {
      if (m.scoreA === null) continue;
      for (const id of m.teamA) {
        const x = by.get(id);
        x.gamesFor += m.scoreA;
        x.gamesAgainst += m.scoreB;
        if (m.scoreA > m.scoreB) x.setsWon++;
      }
      for (const id of m.teamB) {
        const x = by.get(id);
        x.gamesFor += m.scoreB;
        x.gamesAgainst += m.scoreA;
        if (m.scoreB > m.scoreA) x.setsWon++;
      }
    }
  rows.forEach((r) => {
    r.gameBalance = r.gamesFor - r.gamesAgainst;
  });
  rows.sort((a, b) => b.setsWon - a.setsWon || b.gameBalance - a.gameBalance || a.name.localeCompare(b.name));
  return { state, standings: rows };
}

test('o resultado é guardado por jogos disputados e muda com resultados assumidos', () => {
  const { state, standings } = build(3);
  const first = service.projectPath(state, standings, 'p3');
  assert.equal(service.projectPath(state, standings, 'p3'), first, 'mesma entrada, mesmo objeto');
  const open = state.rounds.flatMap((r) => r.matches).filter((m) => m.scoreA === null);
  const what = service.projectPath(state, standings, 'p3', { [open[0].id]: 'A' });
  assert.notEqual(what, first);
  assert.equal(what.forcedMatches.length, 1);
  assert.equal(what.openMatches, first.openMatches - 1);
  for (const g of [1, 2, 3]) {
    assert.ok(!what.goals[g].myMatches.some((m) => m.id === open[0].id), 'jogo assumido sai da lista');
    assert.ok(!what.goals[g].watchMatches.some((m) => m.id === open[0].id));
  }
});

test('os jogos do atleta trazem o lado em que ele joga e a chance se vencer ou perder', () => {
  const { state, standings } = build(3);
  const path = service.projectPath(state, standings, 'p1');
  const open = state.rounds
    .flatMap((r) => r.matches)
    .filter((m) => m.scoreA === null && [...m.teamA, ...m.teamB].includes('p1'));
  const goal = path.goals[3];
  assert.equal(goal.myMatches.length, open.length);
  for (const m of goal.myMatches) {
    assert.ok(m.mySide === 'A' || m.mySide === 'B');
    const win = m.mySide === 'A' ? m.ifAWins : m.ifBWins;
    const loss = m.mySide === 'A' ? m.ifBWins : m.ifAWins;
    assert.ok(win >= loss - 1e-9);
  }
  assert.ok(goal.watchMatches.every((m) => !m.mine && m.swing >= 0.01));
  assert.ok(goal.rivals.length <= 3 && goal.rivals.every((r) => r.gainPerLoss > 0 && r.playerId !== 'p1'));
});

test('os textos seguem o estado: garantido, fora da disputa ou chance em porcentagem', () => {
  let alive = 0,
    clinched = 0,
    eliminated = 0;
  for (let trial = 0; trial < 25; trial++) {
    const { state, standings } = build(5);
    for (const p of players) {
      const path = service.projectPath(state, standings, p.id);
      for (const g of [1, 2, 3]) {
        const goal = path.goals[g];
        if (goal.status === 'clinched') {
          clinched++;
          assert.match(goal.headline, /garantido/i);
          assert.equal(goal.probability, 1);
        } else if (goal.status === 'eliminated') {
          eliminated++;
          assert.match(goal.headline, /Fora/);
          assert.match(goal.detail, /\dº/);
          assert.equal(goal.probability, 0);
        } else {
          alive++;
          assert.match(goal.headline, /^(<1%|>99%|\d{1,2}%) de chance de (ser campeão|chegar ao top [23])$/);
        }
      }
    }
  }
  assert.ok(alive && clinched && eliminated, 'cobrir os três estados');
});

test('o histórico reconstrói a chance rodada a rodada', () => {
  const { state, standings } = build(4, 1);
  const trend = service.pathHistory(state, 'p2');
  assert.deepEqual(
    trend.map((p) => p.label),
    ['Início', 'R1', 'R2', 'R3', 'R4', 'Agora'],
  );
  for (const point of trend)
    for (const g of [1, 2, 3]) assert.ok(point.probability[g] >= 0 && point.probability[g] <= 1);
  const now = service.projectPath(state, standings, 'p2').goals[3].probability;
  assert.ok(Math.abs(trend[trend.length - 1].probability[3] - now) < 0.03, 'o último ponto é a chance atual');
  assert.equal(service.pathHistory(state, 'p2'), trend, 'cache');
  const complete = build(3);
  assert.equal(service.pathHistory(complete.state, 'p2').length, 4, 'sem rodada parcial não há "Agora"');
});

test('formatação de chances nos extremos', () => {
  assert.equal(service.formatChance(0), '0%');
  assert.equal(service.formatChance(0.004), '<1%');
  assert.equal(service.formatChance(0.994), '>99%');
  assert.equal(service.formatChance(1), '100%');
  assert.equal(service.formatChance(0.5), '50%');
});
