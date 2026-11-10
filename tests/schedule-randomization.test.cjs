const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const stubs = { '@angular/core': { Injectable: () => target => target } };
const { ScheduleService } = loadCore('schedule.service', stubs);
const { GroupScheduleService } = loadCore('group-schedule.service', stubs);

/** Deterministic PRNG so a failing draw can be reproduced. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const roster = (size, mixed) => Array.from({ length: size }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Jogador ${index + 1}`,
  gender: mixed ? (index < size / 2 ? 'male' : 'female') : undefined
}));
const expectedRounds = (size, courts, mixed) => size === 24 && mixed ? (courts === 3 ? 24 : 12)
  : size === 24 && courts === 3 ? 46 : size === 10 ? 10 : size === 12 && courts === 2 ? 12 : size - 1;
const superFormats = [
  [8, 2, false], [8, 2, true], [10, 2, false], [10, 2, true], [12, 2, false], [12, 2, true],
  [12, 3, false], [12, 3, true], [24, 6, false], [24, 3, true], [24, 6, true]
];
const pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
const formation = round => round.matches.map(match => [match.teamA, match.teamB].map(team => [...team].sort().join('+')).sort().join(' x ')).sort().join(' / ');

function courtSpread(rounds, courts) {
  const counts = new Map();
  rounds.forEach(round => round.matches.forEach(match => [...match.teamA, ...match.teamB].forEach(id => {
    const perCourt = counts.get(id) ?? Array(courts).fill(0);
    perCourt[match.court - 1]++;
    counts.set(id, perCourt);
  })));
  return counts;
}

function assertRoundStructure(rounds, courts, idFor) {
  const ids = new Set();
  rounds.forEach((round, index) => {
    assert.equal(round.number, index + 1);
    assert.deepEqual(round.matches.map(match => match.court), Array.from({ length: courts }, (_, court) => court + 1));
    round.matches.forEach(match => {
      assert.equal(match.id, idFor(round, match));
      assert.ok(!ids.has(match.id), `id de partida repetido: ${match.id}`);
      ids.add(match.id);
      assert.equal(match.scoreA, null);
      assert.equal(match.scoreB, null);
    });
  });
}

for (const [size, courts, mixed] of superFormats) {
  test(`Super ${size} ${mixed ? 'misto' : 'aberto'} em ${courts} quadras: mantém as regras e alterna quadras`, () => {
    const players = roster(size, mixed);
    const formations = new Set();
    for (let iteration = 0; iteration < 3; iteration++) {
      const rounds = new ScheduleService().generate(players, size, courts, expectedRounds(size, courts, mixed), mixed);
      assertRoundStructure(rounds, courts, (round, match) => `r${round.number}-m${match.court}`);
      formations.add(formation(rounds[0]));

      const played = new Map(players.map(player => [player.id, 0]));
      const rested = new Map(players.map(player => [player.id, 0]));
      const partners = new Map();
      const opponents = new Set();
      for (const round of rounds) {
        const present = [...round.matches.flatMap(match => [...match.teamA, ...match.teamB]), ...round.restingPlayerIds];
        assert.equal(new Set(present).size, size, 'cada jogador aparece uma vez por rodada');
        round.restingPlayerIds.forEach(id => rested.set(id, rested.get(id) + 1));
        for (const match of round.matches) {
          for (const team of [match.teamA, match.teamB]) {
            partners.set(pairKey(...team), (partners.get(pairKey(...team)) ?? 0) + 1);
            team.forEach(id => played.set(id, played.get(id) + 1));
          }
          for (const a of match.teamA) for (const b of match.teamB) opponents.add(pairKey(a, b));
        }
      }
      assert.equal(new Set(played.values()).size, 1, 'todos jogam a mesma quantidade de partidas');
      if (!mixed) {
        assert.ok([...partners.values()].every(count => count === 1), 'nenhuma dupla se repete');
        assert.equal(opponents.size, size * (size - 1) / 2, 'todos se enfrentam');
      }
      if (size === 10 || (size === 12 && courts === 2)) assert.equal(new Set(rested.values()).size, 1, 'descansos equilibrados');

      for (const [id, perCourt] of courtSpread(rounds, courts)) {
        const total = perCourt.reduce((sum, count) => sum + count, 0);
        assert.ok(Math.max(...perCourt) <= Math.ceil(total / courts) + 2, `${id} concentrado em uma quadra: ${perCourt}`);
      }
    }
    assert.ok(formations.size > 1, 'a primeira rodada muda entre gerações');
  });
}

test('a ordem de cadastro não fixa jogador na quadra 1 nem a formação da primeira rodada', () => {
  const players = roster(8, false);
  const scheduler = new ScheduleService();
  const firstRounds = new Set();
  let firstPlayerOnCourtOne = 0;
  for (let iteration = 0; iteration < 10; iteration++) {
    const rounds = scheduler.generate(players, 8, 2, 7);
    firstRounds.add(formation(rounds[0]));
    firstPlayerOnCourtOne += rounds.filter(round => [...round.matches[0].teamA, ...round.matches[0].teamB].includes('p1')).length;
  }
  assert.ok(firstRounds.size > 1);
  // Before the shuffle p1 played all 7 matches on court 1 in every generation (70 of 70).
  assert.ok(firstPlayerOnCourtOne < 50, `p1 jogou ${firstPlayerOnCourtOne} de 70 partidas na quadra 1`);
});

test('a mesma semente gera a mesma tabela', () => {
  const players = roster(12, false);
  const generate = () => {
    const scheduler = new ScheduleService();
    scheduler.random = seeded(42);
    return scheduler.generate(players, 12, 3, 11);
  };
  assert.deepEqual(generate(), generate());
});

test('Super 24 misto em 3 quadras mantém meias rodadas juntas para as finais antecipadas', () => {
  const players = roster(24, true);
  const rounds = new ScheduleService().generate(players, 24, 3, 24, true);
  const played = new Map(players.map(player => [player.id, 0]));
  rounds.forEach((round, index) => {
    round.matches.forEach(match => [...match.teamA, ...match.teamB].forEach(id => played.set(id, played.get(id) + 1)));
    if (index % 2 === 1) assert.equal(new Set(played.values()).size, 1, `rodada ${round.number}: partidas desiguais`);
  });
});

test('formatos com descanso evitam descansos seguidos', () => {
  // Before the shuffle, Super 10 had up to 3 back-to-back rests and Super 12 x 2 between 7 and 18.
  for (const [size, courts, limit] of [[10, 2, 1], [12, 2, 6]]) {
    const rounds = new ScheduleService().generate(roster(size, false), size, courts, expectedRounds(size, courts, false));
    let consecutive = 0;
    for (let index = 1; index < rounds.length; index++) {
      consecutive += rounds[index].restingPlayerIds.filter(id => rounds[index - 1].restingPlayerIds.includes(id)).length;
    }
    assert.ok(consecutive <= limit, `Super ${size}: ${consecutive} descansos seguidos`);
  }
});

for (const size of [8, 12, 24]) {
  for (const mixed of [false, true]) {
    test(`Grupos rotativos ${size} ${mixed ? 'mistos' : 'abertos'}: sorteia grupos e alterna quadras`, () => {
      const players = roster(size, mixed);
      const compositions = new Set();
      const groupCourts = new Map();
      for (let iteration = 0; iteration < 6; iteration++) {
        const { groups, rounds } = new GroupScheduleService().generate(players, 'rotating', [], mixed);
        assert.equal(groups.length, size / 4);
        assert.equal(rounds.length, mixed ? 2 : 3);
        assertRoundStructure(rounds, size / 4, (round, match) => `group-${match.groupId}-r${round.number}-c${match.court}`);
        rounds.forEach(round => assert.equal(round.phase, 'groups'));
        compositions.add(groups.map(group => [...group.playerIds].sort().join(',')).sort().join(' | '));
        for (const group of groups) {
          const members = new Set(group.playerIds);
          const matches = rounds.flatMap(round => round.matches.filter(match => match.groupId === group.id));
          assert.equal(matches.length, mixed ? 2 : 3);
          matches.forEach(match => [...match.teamA, ...match.teamB].forEach(id => assert.ok(members.has(id))));
          if (mixed) {
            const genders = new Map(players.map(player => [player.id, player.gender]));
            matches.forEach(match => [match.teamA, match.teamB].forEach(team => assert.notEqual(genders.get(team[0]), genders.get(team[1]))));
          }
          const courts = groupCourts.get(group.name) ?? new Set();
          matches.forEach(match => courts.add(match.court));
          groupCourts.set(group.name, courts);
        }
      }
      assert.ok(compositions.size > 1, 'os grupos são sorteados');
      assert.ok([...groupCourts.values()].some(courts => courts.size > 1), 'os grupos não ficam presos a uma quadra');
    });
  }

  test(`Grupos de duplas fixas ${size}: mantém duplas e sorteia confrontos`, () => {
    const players = roster(size, true);
    const fixedPairs = Array.from({ length: size / 2 }, (_, index) => [players[index].id, players[index + size / 2].id]);
    const firstRounds = new Set();
    let firstPairOnCourtOne = 0;
    for (let iteration = 0; iteration < 6; iteration++) {
      const { groups, rounds } = new GroupScheduleService().generate(players, 'fixed', fixedPairs, true);
      assert.deepEqual(groups[0].fixedPairs, fixedPairs, 'a lista de duplas mantém a ordem cadastrada');
      assert.equal(rounds.length, size / 2 - 1);
      assertRoundStructure(rounds, size / 4, (round, match) => `group-${match.groupId}-r${round.number}-c${match.court}`);
      const pairKeys = new Set(fixedPairs.map(pair => pairKey(...pair)));
      rounds.forEach(round => round.matches.forEach(match => {
        assert.ok(pairKeys.has(pairKey(...match.teamA)) && pairKeys.has(pairKey(...match.teamB)));
      }));
      firstRounds.add(formation(rounds[0]));
      firstPairOnCourtOne += rounds.filter(round => round.matches[0].teamA.includes(fixedPairs[0][0])
        || round.matches[0].teamB.includes(fixedPairs[0][0])).length;
    }
    assert.ok(firstRounds.size > 1, 'a primeira rodada muda entre gerações');
    assert.ok(firstPairOnCourtOne < 6 * fixedRoundCount(size), 'a primeira dupla não fica sempre na quadra 1');
  });
}

function fixedRoundCount(size) { return size / 2 - 1; }
