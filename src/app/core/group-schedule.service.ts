import { Injectable } from '@angular/core';
import { GroupFormat, Match, Player, Round, TournamentGroup } from './models';

export interface GroupSchedule {
  groups: TournamentGroup[];
  rounds: Round[];
}

@Injectable({ providedIn: 'root' })
export class GroupScheduleService {
  generate(players: Player[], format: GroupFormat, fixedPairs: [string, string][] = []): GroupSchedule {
    if (![8, 12].includes(players.length)) {
      throw new Error('O formato de grupos aceita 8 ou 12 jogadores.');
    }
    if (new Set(players.map(player => player.id)).size !== players.length) {
      throw new Error('Cada jogador precisa ter um identificador único.');
    }
    return format === 'fixed'
      ? this.generateFixedGroups(players, fixedPairs)
      : this.generateRotatingGroups(players);
  }

  private generateRotatingGroups(players: Player[]): GroupSchedule {
    const groups = Array.from({ length: players.length / 4 }, (_, index): TournamentGroup => ({
      id: `group-${index + 1}`,
      name: `Grupo ${String.fromCharCode(65 + index)}`,
      playerIds: players.slice(index * 4, index * 4 + 4).map(player => player.id)
    }));
    const rounds: Round[] = Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      matches: [],
      restingPlayerIds: [],
      phase: 'groups'
    }));

    for (const [groupIndex, group] of groups.entries()) {
      const [first, second, third, fourth] = group.playerIds;
      const rotations: Array<[[string, string], [string, string]]> = [
        [[first, second], [third, fourth]],
        [[first, third], [second, fourth]],
        [[first, fourth], [second, third]]
      ];
      rotations.forEach(([teamA, teamB], roundIndex) => {
        rounds[roundIndex].matches.push(this.createMatch(
          roundIndex,
          groupIndex + 1,
          teamA,
          teamB,
          group.id
        ));
      });
    }

    this.validate(players, groups, rounds, 'rotating');
    return { groups, rounds };
  }

  private generateFixedGroups(players: Player[], fixedPairs: [string, string][]): GroupSchedule {
    this.validateFixedPairs(players, fixedPairs);
    const group: TournamentGroup = {
      id: 'group-1',
      name: 'Grupo A',
      playerIds: players.map(player => player.id),
      fixedPairs: fixedPairs.map(pair => [...pair] as [string, string])
    };
    const rotating = [...fixedPairs];
    const rounds: Round[] = [];

    for (let roundIndex = 0; roundIndex < fixedPairs.length - 1; roundIndex++) {
      const matches = Array.from({ length: fixedPairs.length / 2 }, (_, index) => this.createMatch(
        roundIndex,
        index + 1,
        rotating[index],
        rotating[rotating.length - 1 - index],
        group.id
      ));
      rounds.push({ number: roundIndex + 1, matches, restingPlayerIds: [], phase: 'groups' });
      rotating.splice(1, 0, rotating.pop()!);
    }

    this.validate(players, [group], rounds, 'fixed');
    return { groups: [group], rounds };
  }

  private validateFixedPairs(players: Player[], fixedPairs: [string, string][]): void {
    if (fixedPairs.length !== players.length / 2) {
      throw new Error(`O formato exige exatamente ${players.length / 2} duplas fixas.`);
    }
    const playerIds = new Set(players.map(player => player.id));
    const assigned = fixedPairs.flat();
    if (assigned.length !== players.length || assigned.some(id => !playerIds.has(id))
      || new Set(assigned).size !== players.length) {
      throw new Error('Cada jogador deve aparecer em uma única dupla fixa.');
    }
  }

  private validate(
    players: Player[], groups: TournamentGroup[], rounds: Round[], format: GroupFormat
  ): void {
    const partnerCounts = new Map<string, number>();
    const opponentCounts = new Map<string, number>();
    const gamesPlayed = new Map(players.map(player => [player.id, 0]));

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
        for (const a of match.teamA) for (const b of match.teamB) {
          this.increment(opponentCounts, this.pairKey(a, b));
        }
      }
    }

    const expectedGames = format === 'rotating' ? 3 : groups[0].fixedPairs!.length - 1;
    if ([...gamesPlayed.values()].some(count => count !== expectedGames)) {
      throw new Error('Os jogos não foram distribuídos igualmente nos grupos.');
    }
    if (format === 'rotating' && [...partnerCounts.values()].some(count => count !== 1)) {
      throw new Error('Cada jogador deve formar dupla com os outros três do grupo.');
    }
    if (format === 'fixed' && [...partnerCounts.values()].some(count => count !== rounds.length)) {
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
    roundIndex: number, court: number, teamA: [string, string], teamB: [string, string], groupId: string
  ): Match {
    return {
      id: `group-${groupId}-r${roundIndex + 1}-c${court}`,
      court,
      teamA,
      teamB,
      scoreA: null,
      scoreB: null,
      phase: 'groups',
      groupId
    };
  }

  private pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }
  private increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) ?? 0) + 1); }
}