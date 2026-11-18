import { Injectable } from '@angular/core';
import { GroupFormat, GroupSize, Match, Player, Round, TournamentGroup } from './models';
import { RandomSource, shuffleRoundsAndCourts, shuffled } from './schedule-shuffle';

export interface GroupSchedule {
  groups: TournamentGroup[];
  rounds: Round[];
}

/**
 * A group of five over five rounds, one match per round and one athlete resting: every pair of athletes is partners
 * once and opponents twice. Each row is [resting, [teamA], [teamB]] as positions in the group.
 */
const GROUP_OF_FIVE_ROUNDS: readonly [number, [number, number], [number, number]][] = [
  [0, [1, 4], [2, 3]],
  [1, [0, 2], [3, 4]],
  [2, [1, 3], [0, 4]],
  [3, [2, 4], [0, 1]],
  [4, [0, 3], [1, 2]],
];

@Injectable({ providedIn: 'root' })
export class GroupScheduleService {
  /** Source of randomness for every draw; replaceable by a seeded source in tests. */
  random: RandomSource = Math.random;

  generate(
    players: Player[],
    format: GroupFormat,
    fixedPairs: [string, string][] = [],
    mixed = false,
    groupSize: GroupSize = 4,
  ): GroupSchedule {
    const twenty = players.length === 20 && format === 'rotating' && !mixed;
    if (![8, 12, 24].includes(players.length) && !twenty) {
      throw new Error('O formato de grupos aceita 8, 12 ou 24 jogadores.');
    }
    if (groupSize === 5 && !twenty) throw new Error('Grupos de cinco existem só no formato de 20 jogadores.');
    if (new Set(players.map((player) => player.id)).size !== players.length) {
      throw new Error('Cada jogador precisa ter um identificador único.');
    }
    if (mixed && players.filter((player) => player.gender === 'male').length !== players.length / 2) {
      throw new Error('Duplas mistas exigem a mesma quantidade de atletas masculinos e femininos.');
    }
    const schedule =
      format === 'fixed'
        ? this.generateFixedGroups(players, fixedPairs, mixed)
        : mixed
          ? this.generateMixedRotatingGroups(players)
          : this.generateRotatingGroups(players, groupSize);
    // Groups are drawn above; here the round order and the courts are drawn too, so no group is pinned to a court.
    const rounds = shuffleRoundsAndCourts(schedule.rounds, {
      random: this.random,
      matchId: (roundNumber, match) => `group-${match.groupId}-r${roundNumber}-c${match.court}`,
    });
    this.validate(players, schedule.groups, rounds, format, mixed, groupSize);
    return { groups: schedule.groups, rounds };
  }

  private generateMixedRotatingGroups(players: Player[]): GroupSchedule {
    const men = shuffled(
      players.filter((player) => player.gender === 'male'),
      this.random,
    );
    const women = shuffled(
      players.filter((player) => player.gender === 'female'),
      this.random,
    );
    if (men.length !== women.length || men.length * 2 !== players.length || players.length % 4 !== 0) {
      throw new Error('Grupos mistos exigem grupos de quatro com dois atletas de cada categoria.');
    }
    const groups = Array.from({ length: players.length / 4 }, (_, index): TournamentGroup => ({
      id: `group-${index + 1}`,
      name: `Grupo ${String.fromCharCode(65 + index)}`,
      playerIds: [men[index * 2].id, women[index * 2].id, men[index * 2 + 1].id, women[index * 2 + 1].id],
    }));
    const rounds: Round[] = Array.from({ length: 2 }, (_, index) => ({
      number: index + 1,
      matches: [],
      restingPlayerIds: [],
      phase: 'groups',
    }));
    groups.forEach((group, groupIndex) => {
      const [manA, womanA, manB, womanB] = group.playerIds;
      const rotations = shuffled<[[string, string], [string, string]]>(
        [
          [
            [manA, womanA],
            [manB, womanB],
          ],
          [
            [manA, womanB],
            [manB, womanA],
          ],
        ],
        this.random,
      );
      rotations.forEach(([teamA, teamB], roundIndex) => {
        rounds[roundIndex].matches.push(this.createMatch(roundIndex, groupIndex + 1, teamA, teamB, group.id));
      });
    });
    this.validate(players, groups, rounds, 'rotating', true);
    return { groups, rounds };
  }

  private generateRotatingGroups(players: Player[], groupSize: GroupSize): GroupSchedule {
    const drawnPlayers = shuffled(players, this.random);
    const groups = Array.from({ length: players.length / groupSize }, (_, index): TournamentGroup => ({
      id: `group-${index + 1}`,
      name: `Grupo ${String.fromCharCode(65 + index)}`,
      playerIds: drawnPlayers.slice(index * groupSize, index * groupSize + groupSize).map((player) => player.id),
    }));
    const roundCount = groupSize === 5 ? 5 : 3;
    const rounds: Round[] = Array.from({ length: roundCount }, (_, index) => ({
      number: index + 1,
      matches: [],
      restingPlayerIds: [],
      phase: 'groups',
    }));

    for (const [groupIndex, group] of groups.entries()) {
      const ids = group.playerIds;
      const rotations = shuffled(
        groupSize === 5
          ? GROUP_OF_FIVE_ROUNDS.map(([rest, a, b]) => ({
              teamA: [ids[a[0]], ids[a[1]]] as [string, string],
              teamB: [ids[b[0]], ids[b[1]]] as [string, string],
              rest: ids[rest],
            }))
          : [
              { teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]] },
              { teamA: [ids[0], ids[2]], teamB: [ids[1], ids[3]] },
              { teamA: [ids[0], ids[3]], teamB: [ids[1], ids[2]] },
            ].map((entry) => ({
              teamA: entry.teamA as [string, string],
              teamB: entry.teamB as [string, string],
              rest: undefined as string | undefined,
            })),
        this.random,
      );
      rotations.forEach(({ teamA, teamB, rest }, roundIndex) => {
        rounds[roundIndex].matches.push(this.createMatch(roundIndex, groupIndex + 1, teamA, teamB, group.id));
        if (rest) rounds[roundIndex].restingPlayerIds.push(rest);
      });
    }

    this.validate(players, groups, rounds, 'rotating', false, groupSize);
    return { groups, rounds };
  }

  private generateFixedGroups(players: Player[], fixedPairs: [string, string][], mixed = false): GroupSchedule {
    this.validateFixedPairs(players, fixedPairs, mixed);
    const group: TournamentGroup = {
      id: 'group-1',
      name: 'Grupo A',
      playerIds: players.map((player) => player.id),
      fixedPairs: fixedPairs.map((pair) => [...pair] as [string, string]),
    };
    // The pairs keep their registered order in the group; only the draw of who faces whom, and when, is random.
    const rotating = shuffled(fixedPairs, this.random);
    const rounds: Round[] = [];

    for (let roundIndex = 0; roundIndex < fixedPairs.length - 1; roundIndex++) {
      const matches = Array.from({ length: fixedPairs.length / 2 }, (_, index) =>
        this.createMatch(roundIndex, index + 1, rotating[index], rotating[rotating.length - 1 - index], group.id),
      );
      rounds.push({ number: roundIndex + 1, matches, restingPlayerIds: [], phase: 'groups' });
      rotating.splice(1, 0, rotating.pop()!);
    }

    this.validate(players, [group], rounds, 'fixed', mixed);
    return { groups: [group], rounds };
  }

  private validateFixedPairs(players: Player[], fixedPairs: [string, string][], mixed = false): void {
    if (fixedPairs.length !== players.length / 2) {
      throw new Error(`O formato exige exatamente ${players.length / 2} duplas fixas.`);
    }
    const playerIds = new Set(players.map((player) => player.id));
    const assigned = fixedPairs.flat();
    if (
      assigned.length !== players.length ||
      assigned.some((id) => !playerIds.has(id)) ||
      new Set(assigned).size !== players.length
    ) {
      throw new Error('Cada jogador deve aparecer em uma única dupla fixa.');
    }
    if (
      mixed &&
      fixedPairs.some(
        ([first, second]) =>
          players.find((player) => player.id === first)?.gender ===
          players.find((player) => player.id === second)?.gender,
      )
    ) {
      throw new Error('Cada dupla fixa mista precisa ter um atleta masculino e um feminino.');
    }
  }

  private validate(
    players: Player[],
    groups: TournamentGroup[],
    rounds: Round[],
    format: GroupFormat,
    mixed = false,
    groupSize: GroupSize = 4,
  ): void {
    const partnerCounts = new Map<string, number>();
    const opponentCounts = new Map<string, number>();
    const gamesPlayed = new Map(players.map((player) => [player.id, 0]));

    for (const round of rounds) {
      const seen = new Set<string>();
      for (const match of round.matches) {
        for (const id of [...match.teamA, ...match.teamB]) {
          if (!gamesPlayed.has(id) || seen.has(id)) throw new Error('Jogador duplicado ou inválido na rodada.');
          seen.add(id);
          gamesPlayed.set(id, gamesPlayed.get(id)! + 1);
        }
        this.increment(partnerCounts, this.pairKey(...match.teamA));
        this.increment(partnerCounts, this.pairKey(...match.teamB));
        for (const a of match.teamA)
          for (const b of match.teamB) {
            this.increment(opponentCounts, this.pairKey(a, b));
          }
      }
    }

    const expectedGames = format === 'rotating' ? (mixed ? 2 : groupSize - 1) : groups[0].fixedPairs!.length - 1;
    if ([...gamesPlayed.values()].some((count) => count !== expectedGames)) {
      throw new Error('Os jogos não foram distribuídos igualmente nos grupos.');
    }
    if (format === 'rotating' && [...partnerCounts.values()].some((count) => count !== 1)) {
      throw new Error('Cada jogador deve formar dupla uma vez com cada outro atleta do grupo.');
    }
    if (groupSize === 5 && [...opponentCounts.values()].some((count) => count !== 2)) {
      throw new Error('Cada atleta deve enfrentar cada outro do grupo duas vezes.');
    }
    if (format === 'fixed' && [...partnerCounts.values()].some((count) => count !== rounds.length)) {
      throw new Error('As duplas fixas devem permanecer juntas durante a fase de grupos.');
    }
    for (const group of groups) {
      for (let first = 0; first < group.playerIds.length; first++) {
        for (let second = first + 1; second < group.playerIds.length; second++) {
          const a = group.playerIds[first];
          const b = group.playerIds[second];
          if (!partnerCounts.has(this.pairKey(a, b)) && !opponentCounts.has(this.pairKey(a, b))) {
            throw new Error('Há jogadores do grupo que não se enfrentaram.');
          }
        }
      }
    }
  }

  private createMatch(
    roundIndex: number,
    court: number,
    teamA: [string, string],
    teamB: [string, string],
    groupId: string,
  ): Match {
    return {
      id: `group-${groupId}-r${roundIndex + 1}-c${court}`,
      court,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      phase: 'groups',
      groupId,
    };
  }

  private pairKey(a: string, b: string): string {
    return [a, b].sort().join('|');
  }
  private increment(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}
