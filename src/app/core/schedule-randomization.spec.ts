import { describe, expect, it } from 'vitest';
import { Match, Player, Round, TournamentSize } from './models';
import { ScheduleService } from './schedule.service';
import { GroupScheduleService } from './group-schedule.service';

/** Deterministic PRNG so a failing draw can be reproduced. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// These tests check that draws vary and stay valid. Several services default to Math.random, and a statistical
// check such as "six draws are not all identical" can fail by chance. Each test file runs in its own process,
// so seeding Math.random here makes every run reproduce the same draws.
Math.random = seeded(20261112);

const roster = (size: number, mixed: boolean): Player[] =>
  Array.from({ length: size }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Jogador ${index + 1}`,
    gender: mixed ? (index < size / 2 ? 'male' : 'female') : undefined,
  }));
const expectedRounds = (size: number, courts: number, mixed: boolean): number =>
  size === 24 && mixed
    ? courts === 3
      ? 24
      : 12
    : size === 24 && courts === 3
      ? 46
      : size === 10
        ? 10
        : size === 12 && courts === 2
          ? 12
          : size - 1;
const superFormats: [number, number, boolean][] = [
  [8, 2, false],
  [8, 2, true],
  [10, 2, false],
  [10, 2, true],
  [12, 2, false],
  [12, 2, true],
  [12, 3, false],
  [12, 3, true],
  [24, 6, false],
  [24, 3, true],
  [24, 6, true],
];
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const formation = (round: Round): string =>
  round.matches
    .map((match) =>
      [match.teamA, match.teamB]
        .map((team) => [...team].sort().join('+'))
        .sort()
        .join(' x '),
    )
    .sort()
    .join(' / ');

function courtSpread(rounds: Round[], courts: number): Map<string, number[]> {
  const counts = new Map<string, number[]>();
  rounds.forEach((round) =>
    round.matches.forEach((match) =>
      [...match.teamA, ...match.teamB].forEach((id) => {
        const perCourt = counts.get(id) ?? Array<number>(courts).fill(0);
        perCourt[match.court - 1]++;
        counts.set(id, perCourt);
      }),
    ),
  );
  return counts;
}

function assertRoundStructure(rounds: Round[], courts: number, idFor: (round: Round, match: Match) => string): void {
  const ids = new Set<string>();
  rounds.forEach((round, index) => {
    expect(round.number).toBe(index + 1);
    expect(round.matches.map((match) => match.court)).toStrictEqual(
      Array.from({ length: courts }, (_, court) => court + 1),
    );
    round.matches.forEach((match) => {
      expect(match.id).toBe(idFor(round, match));
      expect(ids.has(match.id), `id de partida repetido: ${match.id}`).toBe(false);
      ids.add(match.id);
      expect(match.scoreA).toBeNull();
      expect(match.scoreB).toBeNull();
    });
  });
}

describe('schedule randomization', () => {
  for (const [size, courts, mixed] of superFormats) {
    it(`Super ${size} ${mixed ? 'misto' : 'aberto'} em ${courts} quadras: mantém as regras e alterna quadras`, () => {
      const players = roster(size, mixed);
      const formations = new Set<string>();
      for (let iteration = 0; iteration < 3; iteration++) {
        const rounds = new ScheduleService().generate(
          players,
          size as TournamentSize,
          courts,
          expectedRounds(size, courts, mixed),
          mixed,
        );
        assertRoundStructure(rounds, courts, (round, match) => `r${round.number}-m${match.court}`);
        formations.add(formation(rounds[0]));

        const played = new Map(players.map((player) => [player.id, 0]));
        const rested = new Map(players.map((player) => [player.id, 0]));
        const partners = new Map<string, number>();
        const opponents = new Set<string>();
        for (const round of rounds) {
          const present = [
            ...round.matches.flatMap((match) => [...match.teamA, ...match.teamB]),
            ...round.restingPlayerIds,
          ];
          expect(new Set(present).size, 'cada jogador aparece uma vez por rodada').toBe(size);
          round.restingPlayerIds.forEach((id) => rested.set(id, rested.get(id)! + 1));
          for (const match of round.matches) {
            for (const team of [match.teamA, match.teamB]) {
              partners.set(pairKey(...team), (partners.get(pairKey(...team)) ?? 0) + 1);
              team.forEach((id) => played.set(id, played.get(id)! + 1));
            }
            for (const a of match.teamA) for (const b of match.teamB) opponents.add(pairKey(a, b));
          }
        }
        expect(new Set(played.values()).size, 'todos jogam a mesma quantidade de partidas').toBe(1);
        if (!mixed) {
          expect(
            [...partners.values()].every((count) => count === 1),
            'nenhuma dupla se repete',
          ).toBe(true);
          expect(opponents.size, 'todos se enfrentam').toBe((size * (size - 1)) / 2);
        }
        if (size === 10 || (size === 12 && courts === 2))
          expect(new Set(rested.values()).size, 'descansos equilibrados').toBe(1);

        for (const [id, perCourt] of courtSpread(rounds, courts)) {
          const total = perCourt.reduce((sum, count) => sum + count, 0);
          expect(Math.max(...perCourt), `${id} concentrado em uma quadra: ${perCourt.join(',')}`).toBeLessThanOrEqual(
            Math.ceil(total / courts) + 2,
          );
        }
      }
      expect(formations.size, 'a primeira rodada muda entre gerações').toBeGreaterThan(1);
    });
  }

  it('a ordem de cadastro não fixa jogador na quadra 1 nem a formação da primeira rodada', () => {
    const players = roster(8, false);
    const scheduler = new ScheduleService();
    const firstRounds = new Set<string>();
    let firstPlayerOnCourtOne = 0;
    for (let iteration = 0; iteration < 10; iteration++) {
      const rounds = scheduler.generate(players, 8, 2, 7);
      firstRounds.add(formation(rounds[0]));
      firstPlayerOnCourtOne += rounds.filter((round) =>
        [...round.matches[0].teamA, ...round.matches[0].teamB].includes('p1'),
      ).length;
    }
    expect(firstRounds.size).toBeGreaterThan(1);
    // Before the shuffle p1 played all 7 matches on court 1 in every generation (70 of 70).
    expect(firstPlayerOnCourtOne, `p1 jogou ${firstPlayerOnCourtOne} de 70 partidas na quadra 1`).toBeLessThan(50);
  });

  it('a mesma semente gera a mesma tabela', () => {
    const players = roster(12, false);
    const generate = (): Round[] => {
      const scheduler = new ScheduleService();
      scheduler.random = seeded(42);
      return scheduler.generate(players, 12, 3, 11);
    };
    expect(generate()).toStrictEqual(generate());
  });

  it('Super 24 misto em 3 quadras mantém meias rodadas juntas para as finais antecipadas', () => {
    const players = roster(24, true);
    const rounds = new ScheduleService().generate(players, 24, 3, 24, true);
    const played = new Map(players.map((player) => [player.id, 0]));
    rounds.forEach((round, index) => {
      round.matches.forEach((match) =>
        [...match.teamA, ...match.teamB].forEach((id) => played.set(id, played.get(id)! + 1)),
      );
      if (index % 2 === 1) expect(new Set(played.values()).size, `rodada ${round.number}: partidas desiguais`).toBe(1);
    });
  });

  it('formatos com descanso evitam descansos seguidos', () => {
    // Before the shuffle, Super 10 had up to 3 back-to-back rests and Super 12 x 2 between 7 and 18.
    for (const [size, courts, limit] of [
      [10, 2, 1],
      [12, 2, 6],
    ]) {
      const rounds = new ScheduleService().generate(
        roster(size, false),
        size as TournamentSize,
        courts,
        expectedRounds(size, courts, false),
      );
      let consecutive = 0;
      for (let index = 1; index < rounds.length; index++) {
        consecutive += rounds[index].restingPlayerIds.filter((id) =>
          rounds[index - 1].restingPlayerIds.includes(id),
        ).length;
      }
      expect(consecutive, `Super ${size}: ${consecutive} descansos seguidos`).toBeLessThanOrEqual(limit);
    }
  });

  for (const size of [8, 12, 24]) {
    for (const mixed of [false, true]) {
      it(`Grupos rotativos ${size} ${mixed ? 'mistos' : 'abertos'}: sorteia grupos e alterna quadras`, () => {
        const players = roster(size, mixed);
        const compositions = new Set<string>();
        const groupCourts = new Map<string, Set<number>>();
        for (let iteration = 0; iteration < 6; iteration++) {
          const { groups, rounds } = new GroupScheduleService().generate(players, 'rotating', [], mixed);
          expect(groups.length).toBe(size / 4);
          expect(rounds.length).toBe(mixed ? 2 : 3);
          assertRoundStructure(
            rounds,
            size / 4,
            (round, match) => `group-${match.groupId}-r${round.number}-c${match.court}`,
          );
          rounds.forEach((round) => expect(round.phase).toBe('groups'));
          compositions.add(
            groups
              .map((group) => [...group.playerIds].sort().join(','))
              .sort()
              .join(' | '),
          );
          for (const group of groups) {
            const members = new Set(group.playerIds);
            const matches = rounds.flatMap((round) => round.matches.filter((match) => match.groupId === group.id));
            expect(matches.length).toBe(mixed ? 2 : 3);
            matches.forEach((match) =>
              [...match.teamA, ...match.teamB].forEach((id) => expect(members.has(id)).toBe(true)),
            );
            if (mixed) {
              const genders = new Map(players.map((player) => [player.id, player.gender]));
              matches.forEach((match) =>
                [match.teamA, match.teamB].forEach((team) =>
                  expect(genders.get(team[0])).not.toBe(genders.get(team[1])),
                ),
              );
            }
            const courts = groupCourts.get(group.name) ?? new Set<number>();
            matches.forEach((match) => courts.add(match.court));
            groupCourts.set(group.name, courts);
          }
        }
        expect(compositions.size, 'os grupos são sorteados').toBeGreaterThan(1);
        expect(
          [...groupCourts.values()].some((courts) => courts.size > 1),
          'os grupos não ficam presos a uma quadra',
        ).toBe(true);
      });
    }

    it(`Grupos de duplas fixas ${size}: mantém duplas e sorteia confrontos`, () => {
      const players = roster(size, true);
      const fixedPairs: [string, string][] = Array.from({ length: size / 2 }, (_, index) => [
        players[index].id,
        players[index + size / 2].id,
      ]);
      const firstRounds = new Set<string>();
      let firstPairOnCourtOne = 0;
      for (let iteration = 0; iteration < 6; iteration++) {
        const { groups, rounds } = new GroupScheduleService().generate(players, 'fixed', fixedPairs, true);
        expect(groups[0].fixedPairs, 'a lista de duplas mantém a ordem cadastrada').toStrictEqual(fixedPairs);
        expect(rounds.length).toBe(size / 2 - 1);
        assertRoundStructure(
          rounds,
          size / 4,
          (round, match) => `group-${match.groupId}-r${round.number}-c${match.court}`,
        );
        const pairKeys = new Set(fixedPairs.map((pair) => pairKey(...pair)));
        rounds.forEach((round) =>
          round.matches.forEach((match) => {
            expect(pairKeys.has(pairKey(...match.teamA))).toBe(true);
            expect(pairKeys.has(pairKey(...match.teamB))).toBe(true);
          }),
        );
        firstRounds.add(formation(rounds[0]));
        firstPairOnCourtOne += rounds.filter(
          (round) =>
            round.matches[0].teamA.includes(fixedPairs[0][0]) || round.matches[0].teamB.includes(fixedPairs[0][0]),
        ).length;
      }
      expect(firstRounds.size, 'a primeira rodada muda entre gerações').toBeGreaterThan(1);
      expect(firstPairOnCourtOne, 'a primeira dupla não fica sempre na quadra 1').toBeLessThan(
        6 * fixedRoundCount(size),
      );
    });
  }
});

function fixedRoundCount(size: number): number {
  return size / 2 - 1;
}
