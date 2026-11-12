const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const schedulerExports = loadCore('schedule.service', { '@angular/core': { Injectable: () => (target) => target } });

const women = [
  'TATI',
  'YASMIN',
  'THAIS',
  'GABI',
  'SARA',
  'RENATA',
  'MISS',
  'ANA THAIS',
  'DÉBORA',
  'BRENDA',
  'MARCELA',
  'ALINE',
];
const men = [
  'WILSON',
  'DANIEL',
  'SAMUEL',
  'ERIQUE',
  'GABRIEL',
  'LUIZ GONZAGA',
  'DOUGLAS',
  'MP',
  'MATHEUS',
  'LUCAS',
  'GUSTAVO',
  'RICHARD',
];
const players = [
  ...women.map((name) => ({ id: name, name, gender: 'female' })),
  ...men.map((name) => ({ id: name, name, gender: 'male' })),
];

for (const courts of [3, 6]) {
  test(`Super 24 misto: ${courts} quadras`, (context) => {
    for (let iteration = 0; iteration < 3; iteration++) {
      const expectedRounds = courts === 3 ? 24 : 12;
      const rounds = new schedulerExports.ScheduleService().generate(players, 24, courts, expectedRounds, true);
      assert.equal(rounds.length, expectedRounds);
      const played = new Map(players.map((player) => [player.id, 0]));
      const rested = new Map(players.map((player) => [player.id, 0]));
      const partners = new Map(players.map((player) => [player.id, new Set()]));
      const opponents = new Set();
      const groups = new Set();
      for (const [index, round] of rounds.entries()) {
        assert.equal(round.number, index + 1);
        assert.equal(round.matches.length, courts);
        assert.equal(round.restingPlayerIds.length, 24 - courts * 4);
        const participants = new Set(round.restingPlayerIds);
        round.restingPlayerIds.forEach((id) => rested.set(id, rested.get(id) + 1));
        for (const match of round.matches) {
          const group = [...match.teamA, ...match.teamB].sort();
          const groupKey = JSON.stringify(group);
          assert.equal(new Set(group).size, 4);
          assert.ok(!groups.has(groupKey), 'grupo de quatro repetido');
          groups.add(groupKey);
          for (const team of [match.teamA, match.teamB]) {
            assert.notEqual(
              players.find((player) => player.id === team[0]).gender,
              players.find((player) => player.id === team[1]).gender,
            );
            assert.ok(!partners.get(team[0]).has(team[1]), 'parceria repetida');
            partners.get(team[0]).add(team[1]);
            partners.get(team[1]).add(team[0]);
            team.forEach((id) => {
              assert.ok(!participants.has(id), 'jogador duplicado na rodada');
              participants.add(id);
              played.set(id, played.get(id) + 1);
            });
          }
          for (const first of match.teamA)
            for (const second of match.teamB) {
              opponents.add(JSON.stringify([first, second].sort()));
            }
        }
        assert.equal(participants.size, 24);
      }
      assert.equal(groups.size, 72);
      for (const player of players) {
        assert.equal(played.get(player.id), 12);
        assert.equal(rested.get(player.id), courts === 3 ? 12 : 0);
        assert.equal(partners.get(player.id).size, 12);
      }
      assert.deepEqual([...partners.get('RICHARD')].sort(), [...women].sort());
      context.diagnostic(`execução ${iteration + 1}: ${opponents.size}/276 pares de adversários distintos`);
    }
  });
}

test('Super 8 mantém sete rodadas nos formatos aberto e misto', () => {
  const participants = [...players.slice(0, 4), ...players.slice(12, 16)];
  for (const mixed of [false, true]) {
    const rounds = new schedulerExports.ScheduleService().generate(participants, 8, 2, 7, mixed);
    assert.equal(rounds.length, 7);
    assert.ok(rounds.every((round) => round.matches.length === 2));
  }
});

test('Super 24 misto exige categorias balanceadas e a quantidade correta de rodadas', () => {
  const scheduler = new schedulerExports.ScheduleService();
  const unbalanced = players.map((player) => ({ ...player }));
  unbalanced[0].gender = 'male';
  assert.throws(() => scheduler.generate(unbalanced, 24, 6, 12, true), /mesma quantidade/);
  assert.throws(() => scheduler.generate(players, 24, 3, 46, true), /24 rodadas/);
  assert.throws(() => scheduler.generate(players, 24, 6, 23, true), /12 rodadas/);
});
