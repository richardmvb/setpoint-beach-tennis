const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');

function loadTypeScript(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/core', file), 'utf8');
  const javascript = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, experimentalDecorators: true }
  }).outputText;
  const exports = {};
  new Function('require', 'exports', javascript)(name => {
    if (name === '@angular/core') return { Injectable: () => target => target };
    return dependencies[name] ?? require(name);
  }, exports);
  return exports;
}

const live = loadTypeScript('final-live-score.ts');
const { FinalsService } = loadTypeScript('finals.service.ts', { './final-live-score': live });
const { StorageService } = loadTypeScript('storage.service.ts', { './final-live-score': live, './profile': loadTypeScript('profile.ts') });
const { ShareCardService } = loadTypeScript('share-card.service.ts', { './finals.service': { FinalsService } });

function game(points, side) { points.push(...Array(4).fill(side)); }
function tiedSet() {
  const points = [];
  for (let index = 0; index < 12; index++) game(points, index % 2 ? 'B' : 'A');
  return points;
}
function fixture() {
  const players = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, name: `Jogador ${index}` }));
  const service = new FinalsService();
  return {
    service,
    state: {
      version: 1, name: 'Final', size: 8, courts: 2, gamesToWin: 4, roundCount: 7,
      createdAt: '2026-11-08T10:00:00Z', players, rounds: [],
      finals: service.create(players.map(player => ({ playerId: player.id })))
    }
  };
}

test('40–40 é ponto decisivo sem vantagem', () => {
  const points = [...'AAABBB'];
  assert.equal(live.calculateFinalLiveScore(points).pointsA, '40');
  assert.equal(live.calculateFinalLiveScore(points).pointsB, '40');
  const score = live.calculateFinalLiveScore([...points, 'B']);
  assert.equal(score.gamesA, 0);
  assert.equal(score.gamesB, 1);
  assert.equal(score.pointsA, '0');
  assert.equal(score.pointsB, '0');
});

test('set termina em 6–4 ou 7–5, sem encerrar em 6–5', () => {
  const points = [];
  for (let index = 0; index < 10; index++) game(points, index % 2 ? 'B' : 'A');
  game(points, 'A');
  assert.equal(live.calculateFinalLiveScore(points).winner, null);
  assert.equal(live.calculateFinalLiveScore(points).gamesA, 6);
  game(points, 'A');
  assert.equal(live.calculateFinalLiveScore(points).winner, 1);
  assert.deepEqual(live.finalLiveMatchScore(live.calculateFinalLiveScore(points)), { scoreA: 7, scoreB: 5, tieBreakA: null, tieBreakB: null });
  const sixFour = [];
  for (let index = 0; index < 4; index++) { game(sixFour, 'A'); game(sixFour, 'B'); }
  game(sixFour, 'A'); game(sixFour, 'A');
  assert.equal(live.calculateFinalLiveScore(sixFour).winner, 1);
  assert.equal(live.calculateFinalLiveScore(sixFour).gamesA, 6);
  assert.throws(() => live.calculateFinalLiveScore([...sixFour, 'A']), /inválida/);
});

test('tie-break em 6–6 exige sete pontos e dois de diferença, inclusive ao desfazer', () => {
  const points = tiedSet();
  let score = live.calculateFinalLiveScore(points);
  assert.equal(score.tieBreak, true);
  assert.equal(score.gamesA, 6);
  assert.equal(score.gamesB, 6);
  points.push(...'ABABABABABAB');
  score = live.calculateFinalLiveScore(points);
  assert.equal(score.winner, null);
  assert.equal(score.tieBreakA, 6);
  assert.equal(score.tieBreakB, 6);
  points.push('A', 'A');
  score = live.calculateFinalLiveScore(points);
  assert.equal(score.winner, 1);
  assert.deepEqual(live.finalLiveMatchScore(score), { scoreA: 7, scoreB: 6, tieBreakA: 8, tieBreakB: 6 });
  assert.equal(live.calculateFinalLiveScore(points.slice(0, -1)).winner, null);
  assert.equal(live.calculateFinalLiveScore(points.slice(0, -1)).tieBreakA, 7);
  assert.throws(() => live.calculateFinalLiveScore([...points, 'B']), /inválida/);
});

test('a dupla 2 pode vencer o tie-break e desfazer reabre o set', () => {
  const points = tiedSet();
  points.push(...'ABABABABABABBB');
  const score = live.calculateFinalLiveScore(points);
  assert.equal(score.winner, 2);
  assert.deepEqual(live.finalLiveMatchScore(score), { scoreA: 6, scoreB: 7, tieBreakA: 6, tieBreakB: 8 });
  assert.equal(live.calculateFinalLiveScore(points.slice(0, -1)).winner, null);
  assert.throws(() => live.calculateFinalLiveScore(['X']), /inválida/);
});

test('o pódio exige a final e o terceiro lugar, sem alterar a disputa de terceiro', () => {
  const { service, state } = fixture();
  const championship = state.finals.matches.find(match => match.finalKind === 'championship');
  const third = state.finals.matches.find(match => match.finalKind === 'third-place');
  const points = tiedSet();
  points.push(...'ABABABABABABAA');
  championship.livePoints = points;
  Object.assign(championship, live.finalLiveMatchScore(live.calculateFinalLiveScore(points)));
  assert.equal(service.winnerSide(championship), 1);
  assert.equal(service.updatePodium(state.finals).complete, false);
  third.scoreA = 4; third.scoreB = 6;
  const final = service.updatePodium(state.finals);
  assert.equal(final.complete, true);
  assert.equal(service.winnerSide(third), 2);
  assert.equal(final.matches.find(match => match.finalKind === 'third-place').livePoints, undefined);
  assert.deepEqual(final.podiumPlayerIds.slice(0, 2), championship.teamA);
  state.finals = final;
  const cards = new ShareCardService(service);
  const winner = cards.playerResults(state, championship.teamA[0]).find(result => result.label === 'Final');
  const runnerUp = cards.playerResults(state, championship.teamB[0]).find(result => result.label === 'Final');
  assert.equal(winner.won, true);
  assert.equal(runnerUp.won, false);
  assert.match(winner.score, /7 × 6 \(8–6\)/);
});

test('backup preserva o ponto a ponto e rejeita histórico inconsistente ou na disputa de terceiro', () => {
  const { state } = fixture();
  const championship = state.finals.matches.find(match => match.finalKind === 'championship');
  championship.livePoints = [...'AAABBB'];
  Object.assign(championship, live.finalLiveMatchScore(live.calculateFinalLiveScore(championship.livePoints)));
  const storage = new StorageService();
  const parsed = storage.parseTournament(JSON.stringify(state));
  assert.deepEqual(parsed.finals.matches[0].livePoints, championship.livePoints);
  const invalid = structuredClone(state);
  invalid.finals.matches[0].scoreA = 6;
  assert.equal(storage.parseTournament(JSON.stringify(invalid)), null);
  const third = structuredClone(state);
  third.finals.matches[1].livePoints = [];
  assert.equal(storage.parseTournament(JSON.stringify(third)), null);
  const afterWinner = structuredClone(state);
  const complete = tiedSet();
  complete.push(...'AAAAAAAA');
  afterWinner.finals.matches[0].livePoints = complete;
  assert.equal(storage.parseTournament(JSON.stringify(afterWinner)), null);
  const longTie = tiedSet();
  for (let index = 0; index < 99; index++) longTie.push('A', 'B');
  longTie.push('A', 'A');
  championship.livePoints = longTie;
  Object.assign(championship, live.finalLiveMatchScore(live.calculateFinalLiveScore(longTie)));
  assert.equal(championship.tieBreakA, 101);
  assert.ok(storage.parseTournament(JSON.stringify(state)));
});

test('alterar as semifinais limpa os pontos de uma final com outras duplas', () => {
  const { service } = fixture();
  const men = Array.from({ length: 8 }, (_, index) => ({ playerId: `m${index}` }));
  const women = Array.from({ length: 8 }, (_, index) => ({ playerId: `w${index}` }));
  const stage = service.createMixedBracket(men, women);
  const championship = stage.matches.find(match => match.finalKind === 'championship');
  championship.teamA = ['m0', 'w0'];
  championship.teamB = ['m1', 'w1'];
  championship.livePoints = ['A'];
  championship.scoreA = 0;
  championship.scoreB = 0;
  const updated = service.updatePodium(stage).matches.find(match => match.finalKind === 'championship');
  assert.equal(updated.livePoints, undefined);
  assert.equal(updated.scoreA, null);
  assert.equal(updated.scoreB, null);
});