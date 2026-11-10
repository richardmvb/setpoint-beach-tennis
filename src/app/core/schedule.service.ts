import { Injectable } from '@angular/core';
import { Match, Player, Round, TournamentSize } from './models';
import { RandomSource, shuffleRoundsAndCourts, shuffled } from './schedule-shuffle';

type PartnerTeam = [string, string];
type TeamMatch = [PartnerTeam, PartnerTeam];
/** Teams and matches by player index: the search loops work on numbers instead of string keys. */
type IndexTeam = [number, number];
type IndexMatch = [IndexTeam, IndexTeam];

interface RoundOption {
  matches: Match[];
  restingPlayerIds: string[];
  restingIndexes: number[];
  opponentPairs: number[];
}

/** Counts how many times each pair of players (by index) faced each other and how many distinct pairs did. */
class PairCounter {
  private readonly counts: Int32Array;
  covered = 0;

  constructor(private readonly playerCount: number) {
    this.counts = new Int32Array(playerCount * playerCount);
  }

  index(a: number, b: number): number { return a < b ? a * this.playerCount + b : b * this.playerCount + a; }
  get(pair: number): number { return this.counts[pair]; }

  adjust(pairs: number[], amount: 1 | -1): void {
    for (const pair of pairs) {
      const before = this.counts[pair];
      this.counts[pair] = before + amount;
      if (before === 0) this.covered++;
      else if (before + amount === 0) this.covered--;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  /** Source of randomness for every draw; replaceable by a seeded source in tests. */
  random: RandomSource = Math.random;

  generate(players: Player[], size: TournamentSize, courts: number, roundCount: number, mixed = false): Round[] {
    if (players.length !== size) throw new Error(`O Super ${size} exige exatamente ${size} jogadores.`);
    if (new Set(players.map(player => player.id)).size !== players.length) {
      throw new Error('Cada jogador precisa ter um identificador único.');
    }
    const expectedRounds = this.expectedRounds(size, courts, mixed);
    const allowedCourts = size === 24 ? [3, 6] : size === 12 ? [2, 3] : [2];
    if (roundCount !== expectedRounds) {
      throw new Error(`O Super ${size} precisa de exatamente ${expectedRounds} rodadas.`);
    }
    if (!Number.isInteger(courts) || !allowedCourts.includes(courts)) {
      throw new Error(`O Super ${size} permite ${allowedCourts.join(' ou ')} quadras sem comprometer o equilíbrio dos jogos.`);
    }

    // The registration order must not decide partners, opponents, round order or courts.
    const drawnPlayers = shuffled(players, this.random);
    const rounds = size === 24
      ? this.generateSuper24(drawnPlayers, mixed, courts)
      : this.generateBalanced(drawnPlayers, size, courts, mixed);
    const result = shuffleRoundsAndCourts(rounds, {
      random: this.random,
      blockSize: size === 24 && courts === 3 ? 2 : 1,
      matchId: (roundNumber, match) => `r${roundNumber}-m${match.court}`
    });
    this.validateSchedule(players, size, courts, result, mixed);
    return result;
  }

  private generateBalanced(players: Player[], size: TournamentSize, courts: number, mixed: boolean): Round[] {
    const expectedRounds = this.expectedRounds(size, courts, mixed);
    const indexOf = new Map(players.map((player, index) => [player.id, index]));
    const partnerRounds = mixed
      ? this.createMixedPartnerRounds(players, expectedRounds)
      : this.createPartnerRounds(players);
    const searchRoundCount = partnerRounds.length;
    const optionsByRound = partnerRounds.map((teams, index) => this.createRoundOptions(teams, index, courts, indexOf));
    const totalPairs = size * (size - 1) / 2;
    const equalizingRoundNeeded = !mixed && (size === 10 || (size === 12 && courts === 2));
    const restsPerRound = size - courts * 4;
    const maxRestCount = equalizingRoundNeeded ? restsPerRound
      : mixed && restsPerRound > 0 ? Math.ceil(searchRoundCount * restsPerRound / size) : 0;

    for (let attempt = 0; attempt < 1000; attempt++) {
      const opponents = new PairCounter(size);
      const rests = new Int32Array(size);
      let restSquares = 0;
      const apply = (option: RoundOption, amount: 1 | -1): void => {
        opponents.adjust(option.opponentPairs, amount);
        for (const index of option.restingIndexes) {
          const before = rests[index];
          rests[index] = before + amount;
          restSquares += (before + amount) * (before + amount) - before * before;
        }
      };
      const cost = (): number => (totalPairs - opponents.covered) * 100 + restSquares;

      const selected = this.createInitialSelection(optionsByRound, size, maxRestCount);
      selected.forEach(option => apply(option, 1));
      const steps = size * 800;

      for (let step = 0; step < steps; step++) {
        const roundIndex = Math.floor(this.random() * searchRoundCount);
        const previous = selected[roundIndex];
        const candidates = optionsByRound[roundIndex];
        const candidate = candidates[Math.floor(this.random() * candidates.length)];
        if (candidate === previous) continue;

        const previousCost = cost();
        apply(previous, -1);
        if (candidate.restingIndexes.some(index => rests[index] >= maxRestCount)) {
          apply(previous, 1);
          continue;
        }
        apply(candidate, 1);
        const candidateCost = cost();
        const temperature = 30 * (1 - step / steps) + 0.1;

        if (candidateCost <= previousCost || this.random() < Math.exp((previousCost - candidateCost) / temperature)) {
          selected[roundIndex] = candidate;
          if (opponents.covered === totalPairs) {
            const rounds = this.completeSchedule(players, size, courts, selected, equalizingRoundNeeded, mixed);
            if (rounds) return rounds;
          }
        } else {
          apply(candidate, -1);
          apply(previous, 1);
        }
      }

      if (equalizingRoundNeeded) {
        const rounds = this.completeSchedule(players, size, courts, selected, equalizingRoundNeeded, mixed);
        if (rounds) return rounds;
      }
    }

    throw new Error('Não foi possível montar uma tabela sem repetir parceiros e com todos os confrontos. Tente gerar novamente.');
  }

  private completeSchedule(
    players: Player[], size: TournamentSize, courts: number, selected: RoundOption[], equalizingRoundNeeded: boolean, mixed: boolean
  ): Round[] | null {
    const baseRounds = this.toRounds(selected);
    const finalRound = equalizingRoundNeeded ? this.createEqualizingRound(players, baseRounds, courts) : null;
    if (equalizingRoundNeeded && !finalRound) return null;
    const rounds = finalRound ? [...baseRounds, finalRound] : baseRounds;
    try {
      this.validateSchedule(players, size, courts, rounds, mixed);
      return rounds;
    } catch {
      return null;
    }
  }

  private generateSuper24(players: Player[], mixed = false, courts = 6): Round[] {
    const playerCount = players.length;
    const indexOf = new Map(players.map((player, index) => [player.id, index]));
    const partnerRounds = (mixed ? this.createMixedPartnerRounds(players, 12) : this.createPartnerRounds(players))
      .map(teams => teams.map(([a, b]): IndexTeam => [indexOf.get(a)!, indexOf.get(b)!]));
    const rounds = partnerRounds.length;
    const totalPairs = playerCount * (playerCount - 1) / 2;
    let bestSelection: IndexMatch[][] | null = null;
    let bestCoverage = 0;

    for (let attempt = 0; attempt < (mixed ? 3 : 16); attempt++) {
      const opponents = new PairCounter(playerCount);
      const selected = partnerRounds.map(teams => this.randomTeamMatches(teams));
      const groups = new Map<number, number>();
      selected.forEach(matches => opponents.adjust(this.opponentPairsForMatches(matches, opponents), 1));
      if (mixed) selected.forEach(matches => this.adjustCounts(this.groupKeysForMatches(matches, playerCount), 1, groups));
      const steps = mixed ? 8000 : 24 * 2500;

      for (let step = 0; step < steps; step++) {
        const roundIndex = Math.floor(this.random() * rounds);
        const previous = selected[roundIndex];
        const candidate = mixed ? this.swapTeamOpponents(previous) : this.randomTeamMatches(partnerRounds[roundIndex]);
        const previousPairs = this.opponentPairsForMatches(previous, opponents);
        const candidatePairs = this.opponentPairsForMatches(candidate, opponents);
        if (previousPairs.every(pair => candidatePairs.includes(pair))) continue;

        const affected = new Set([...previousPairs, ...candidatePairs]);
        const previousGroups = mixed ? this.groupKeysForMatches(previous, playerCount) : [];
        const candidateGroups = mixed ? this.groupKeysForMatches(candidate, playerCount) : [];
        const affectedGroups = new Set([...previousGroups, ...candidateGroups]);
        const oldCost = this.affectedOpponentCost(opponents, affected) + this.repeatedGroupCost(groups, affectedGroups);
        opponents.adjust(previousPairs, -1);
        opponents.adjust(candidatePairs, 1);
        this.adjustCounts(previousGroups, -1, groups);
        this.adjustCounts(candidateGroups, 1, groups);
        const newCost = this.affectedOpponentCost(opponents, affected) + this.repeatedGroupCost(groups, affectedGroups);
        const temperature = 8 * (1 - step / steps) + 0.15;

        if (newCost <= oldCost || this.random() < Math.exp((oldCost - newCost) / temperature)) {
          selected[roundIndex] = candidate;
          if (mixed && groups.size === rounds * 6 && opponents.covered > bestCoverage) {
            bestCoverage = opponents.covered;
            bestSelection = [...selected];
          }
          if (opponents.covered === totalPairs && (!mixed || groups.size === rounds * 6)) {
            const result = this.toSuper24Rounds(selected, courts, players);
            this.validateSchedule(players, 24, courts, result, mixed);
            return result;
          }
        } else {
          opponents.adjust(candidatePairs, -1);
          opponents.adjust(previousPairs, 1);
          this.adjustCounts(candidateGroups, -1, groups);
          this.adjustCounts(previousGroups, 1, groups);
        }
      }
    }

    if (bestSelection) {
      const result = this.toSuper24Rounds(bestSelection, courts, players);
      this.validateSchedule(players, 24, courts, result, mixed);
      return result;
    }
    throw new Error('Não foi possível distribuir os confrontos do Super 24. Gere a tabela novamente.');
  }

  private toSuper24Rounds(selected: IndexMatch[][], courts: number, players: Player[]): Round[] {
    const rounds: Round[] = [];
    const id = (index: number): string => players[index].id;
    selected.forEach(matches => {
      const batches = courts === 3 ? [matches.slice(0, 3), matches.slice(3)] : [matches];
      batches.forEach(batch => {
        const active = new Set(batch.flatMap(([teamA, teamB]) => [...teamA, ...teamB]));
        const number = rounds.length + 1;
        rounds.push({
          number,
          matches: batch.map(([teamA, teamB], matchIndex): Match => ({
            id: `r${number}-m${matchIndex + 1}`,
            court: matchIndex + 1,
            teamA: [id(teamA[0]), id(teamA[1])],
            teamB: [id(teamB[0]), id(teamB[1])],
            scoreA: null,
            scoreB: null
          })),
          restingPlayerIds: players.filter((_, index) => !active.has(index)).map(player => player.id)
        });
      });
    });
    return rounds;
  }

  private randomTeamMatches(teams: IndexTeam[]): IndexMatch[] {
    const drawn = shuffled(teams, this.random);
    return Array.from({ length: drawn.length / 2 }, (_, index): IndexMatch => [drawn[index * 2], drawn[index * 2 + 1]]);
  }

  private swapTeamOpponents(matches: IndexMatch[]): IndexMatch[] {
    const first = Math.floor(this.random() * matches.length);
    let second = Math.floor(this.random() * (matches.length - 1));
    if (second >= first) second++;
    const result = [...matches];
    result[first] = [matches[first][0], matches[second][1]];
    result[second] = [matches[second][0], matches[first][1]];
    return result;
  }

  private opponentPairsForMatches(matches: IndexMatch[], counter: PairCounter): number[] {
    const pairs: number[] = [];
    for (const [[a1, a2], [b1, b2]] of matches) {
      pairs.push(counter.index(a1, b1), counter.index(a1, b2), counter.index(a2, b1), counter.index(a2, b2));
    }
    return pairs;
  }

  /** Identifies the four players of each match, regardless of how they are split into teams. */
  private groupKeysForMatches(matches: IndexMatch[], playerCount: number): number[] {
    return matches.map(([teamA, teamB]) => [...teamA, ...teamB]
      .sort((a, b) => a - b)
      .reduce((key, index) => key * playerCount + index, 0));
  }

  private repeatedGroupCost(groups: Map<number, number>, keys: Set<number>): number {
    let total = 0;
    for (const key of keys) total += Math.max(0, (groups.get(key) ?? 0) - 1) * 1000;
    return total;
  }

  private adjustCounts(keys: number[], amount: 1 | -1, counts: Map<number, number>): void {
    for (const key of keys) {
      const next = (counts.get(key) ?? 0) + amount;
      if (next === 0) counts.delete(key);
      else counts.set(key, next);
    }
  }

  private affectedOpponentCost(counter: PairCounter, pairs: Set<number>): number {
    let total = 0;
    for (const pair of pairs) total += this.opponentCountCost(counter.get(pair));
    return total;
  }

  private opponentCountCost(count: number): number {
    if (count === 0) return 16;
    if (count === 1) return 1.5;
    return (count - 2) ** 2;
  }

  private createPartnerRounds(players: Player[]): PartnerTeam[][] {
    const rotating = [...players];
    const rounds: PartnerTeam[][] = [];
    for (let roundIndex = 0; roundIndex < players.length - 1; roundIndex++) {
      rounds.push(Array.from({ length: players.length / 2 }, (_, index) => [
        rotating[index].id, rotating[players.length - 1 - index].id
      ] as PartnerTeam));
      rotating.splice(1, 0, rotating.pop()!);
    }
    return rounds;
  }

  private createMixedPartnerRounds(players: Player[], roundCount: number): PartnerTeam[][] {
    const men = players.filter(player => player.gender === 'male');
    const women = players.filter(player => player.gender === 'female');
    if (men.length !== women.length || men.length * 2 !== players.length) {
      throw new Error('Duplas mistas exigem a mesma quantidade de atletas masculinos e femininos.');
    }
    return Array.from({ length: roundCount }, (_, roundIndex) => men.map((player, index) => [
      player.id, women[(index + roundIndex) % women.length].id
    ] as PartnerTeam));
  }

  private createRoundOptions(
    teams: PartnerTeam[], roundIndex: number, courtCount: number, indexOf: Map<string, number>
  ): RoundOption[] {
    const options: RoundOption[] = [];
    const activeTeamCount = courtCount * 2;
    const playerCount = indexOf.size;
    const pairIndex = (a: string, b: string): number => {
      const first = indexOf.get(a)!;
      const second = indexOf.get(b)!;
      return first < second ? first * playerCount + second : second * playerCount + first;
    };
    for (const activeTeams of this.chooseTeams(teams, activeTeamCount)) {
      const activeIds = new Set(activeTeams.flat());
      const restingPlayerIds = teams.filter(team => !activeIds.has(team[0])).flat();
      const restingIndexes = restingPlayerIds.map(id => indexOf.get(id)!);
      for (const pairing of this.pairTeams(activeTeams)) {
        const matches = pairing.map(([teamA, teamB], matchIndex): Match => ({
          id: `r${roundIndex + 1}-m${matchIndex + 1}`,
          court: matchIndex + 1,
          teamA,
          teamB,
          scoreA: null,
          scoreB: null
        }));
        const opponentPairs = matches.flatMap(match => match.teamA.flatMap(a => match.teamB.map(b => pairIndex(a, b))));
        options.push({ matches, restingPlayerIds, restingIndexes, opponentPairs });
      }
    }
    return options;
  }

  private pairTeams(teams: PartnerTeam[]): TeamMatch[][] {
    if (!teams.length) return [[]];
    const [first, ...remaining] = teams;
    const result: TeamMatch[][] = [];
    for (let index = 0; index < remaining.length; index++) {
      const opponent = remaining[index];
      const rest = remaining.filter((_, restIndex) => restIndex !== index);
      for (const pairing of this.pairTeams(rest)) result.push([[first, opponent], ...pairing]);
    }
    return result;
  }

  private chooseTeams(teams: PartnerTeam[], count: number): PartnerTeam[][] {
    if (count === 0) return [[]];
    if (teams.length < count) return [];
    const [first, ...remaining] = teams;
    return [
      ...this.chooseTeams(remaining, count - 1).map(selection => [first, ...selection]),
      ...this.chooseTeams(remaining, count)
    ];
  }

  private createInitialSelection(optionsByRound: RoundOption[][], playerCount: number, maxRestCount: number): RoundOption[] {
    const plannedRests = new Int32Array(playerCount);
    return optionsByRound.map(options => {
      const eligible = options.filter(option => option.restingIndexes.every(index => plannedRests[index] < maxRestCount));
      const candidates = eligible.length ? eligible : options;
      let minimumRestCost = Number.POSITIVE_INFINITY;
      let bestOptions: RoundOption[] = [];
      for (const option of candidates) {
        const restCost = option.restingIndexes.reduce((sum, index) => sum + 2 * plannedRests[index] + 1, 0);
        if (restCost < minimumRestCost) {
          minimumRestCost = restCost;
          bestOptions = [option];
        } else if (restCost === minimumRestCost) {
          bestOptions.push(option);
        }
      }
      const selected = bestOptions[Math.floor(this.random() * bestOptions.length)];
      selected.restingIndexes.forEach(index => plannedRests[index]++);
      return selected;
    });
  }

  private toRounds(selected: RoundOption[]): Round[] {
    return selected.map((option, roundIndex) => ({
      number: roundIndex + 1,
      matches: option.matches,
      restingPlayerIds: option.restingPlayerIds
    }));
  }

  private createEqualizingRound(players: Player[], rounds: Round[], courts: number): Round | null {
    const restCounts = new Map(players.map(player => [player.id, 0]));
    const partnerCounts = new Set<string>();
    const opponentCounts = new Set<string>();
    for (const round of rounds) {
      round.restingPlayerIds.forEach(id => this.increment(restCounts, id));
      for (const match of round.matches) {
        partnerCounts.add(this.pairKey(...match.teamA));
        partnerCounts.add(this.pairKey(...match.teamB));
        for (const a of match.teamA) for (const b of match.teamB) opponentCounts.add(this.pairKey(a, b));
      }
    }

    const requiredFinalRests = players.length - courts * 4;
    const restingPlayerIds = [...restCounts]
      .filter(([, count]) => count === requiredFinalRests - 1)
      .map(([id]) => id);
    if (restingPlayerIds.length !== requiredFinalRests) return null;
    const restingSet = new Set(restingPlayerIds);
    const activeIds = players.filter(player => !restingSet.has(player.id)).map(player => player.id);

    // Every pair that has not met yet must meet in this last round; resting players cannot meet anyone.
    const missingPairs: PartnerTeam[] = [];
    for (let first = 0; first < players.length; first++) {
      for (let second = first + 1; second < players.length; second++) {
        const a = players[first].id;
        const b = players[second].id;
        if (opponentCounts.has(this.pairKey(a, b))) continue;
        if (restingSet.has(a) || restingSet.has(b)) return null;
        missingPairs.push([a, b]);
      }
    }

    for (const teams of this.pairPlayers(activeIds)) {
      if (teams.some(team => partnerCounts.has(this.pairKey(...team)))) continue;
      for (const pairing of this.pairTeams(teams)) {
        const opponentOf = new Set<string>();
        pairing.forEach(([teamA, teamB]) => {
          for (const a of teamA) for (const b of teamB) opponentOf.add(this.pairKey(a, b));
        });
        if (!missingPairs.every(([a, b]) => opponentOf.has(this.pairKey(a, b)))) continue;

        const matches = pairing.map(([teamA, teamB], index): Match => ({
          id: `r${rounds.length + 1}-m${index + 1}`,
          court: index + 1,
          teamA,
          teamB,
          scoreA: null,
          scoreB: null
        }));
        return { number: rounds.length + 1, matches, restingPlayerIds };
      }
    }
    return null;
  }

  private pairPlayers(playerIds: string[]): PartnerTeam[][] {
    if (!playerIds.length) return [[]];
    const [first, ...remaining] = playerIds;
    const result: PartnerTeam[][] = [];
    for (let index = 0; index < remaining.length; index++) {
      const teammate = remaining[index];
      const rest = remaining.filter((_, restIndex) => restIndex !== index);
      for (const pairs of this.pairPlayers(rest)) result.push([[first, teammate], ...pairs]);
    }
    return result;
  }

  private validateSchedule(players: Player[], size: TournamentSize, courts: number, rounds: Round[], mixed = false): void {
    const playerIds = players.map(player => player.id);
    const genders = new Map(players.map(player => [player.id, player.gender]));
    const partnerCounts = new Map<string, number>();
    const opponentCounts = new Map<string, number>();
    const groups = new Set<string>();
    const restCounts = new Map(playerIds.map(id => [id, 0]));

    const expectedRounds = this.expectedRounds(size, courts, mixed);
    const expectedMatches = courts;
    if (rounds.length !== expectedRounds) throw new Error('Quantidade incorreta de rodadas.');
    for (const [roundIndex, round] of rounds.entries()) {
      if (round.number !== roundIndex + 1 || round.matches.length !== expectedMatches) {
        throw new Error('Rodada incompleta ou fora de ordem.');
      }
      const seen = new Set<string>();
      for (const match of round.matches) {
        if (match.teamA.length !== 2 || match.teamB.length !== 2) throw new Error('Partida inválida.');
        if (mixed && size === 24) {
          const group = JSON.stringify([...match.teamA, ...match.teamB].sort());
          if (groups.has(group)) throw new Error('Há um grupo de quatro jogadores repetido.');
          groups.add(group);
        }
        if (mixed && [match.teamA, match.teamB].some(team => genders.get(team[0]) === genders.get(team[1]))) {
          throw new Error('Cada dupla mista precisa ter um atleta masculino e um feminino.');
        }
        for (const id of [...match.teamA, ...match.teamB]) {
          if (!restCounts.has(id) || seen.has(id)) throw new Error('Jogador duplicado na rodada.');
          seen.add(id);
        }
        this.increment(partnerCounts, this.pairKey(...match.teamA));
        this.increment(partnerCounts, this.pairKey(...match.teamB));
        for (const a of match.teamA) for (const b of match.teamB) {
          this.increment(opponentCounts, this.pairKey(a, b));
        }
      }
      for (const id of round.restingPlayerIds) {
        if (!restCounts.has(id) || seen.has(id)) throw new Error('Descanso duplicado ou inválido.');
        seen.add(id);
        this.increment(restCounts, id);
      }
      if (seen.size !== size) throw new Error('Nem todos os jogadores foram alocados na rodada.');
    }

    if ([...partnerCounts.values()].some(count => count > (mixed && size !== 24 ? 2 : 1))) {
      throw new Error('Há uma dupla repetida.');
    }
    if (!(mixed && size === 24)) {
      for (let first = 0; first < playerIds.length; first++) {
        for (let second = first + 1; second < playerIds.length; second++) {
          if (!opponentCounts.has(this.pairKey(playerIds[first], playerIds[second]))) {
            throw new Error('Há jogadores que ainda não se enfrentaram.');
          }
        }
      }
    }
    if ((size === 10 || (size === 12 && courts === 2))
      && Math.max(...restCounts.values()) !== Math.min(...restCounts.values())) {
      throw new Error('Os descansos não foram distribuídos de forma equilibrada.');
    }
    const matchesPerPlayer = mixed && size === 24 ? 12 : size === 10 || (size === 12 && courts === 2) ? 8 : size - 1;
    const playedCounts = new Map(playerIds.map(id => [id, 0]));
    rounds.forEach(round => round.matches.forEach(match => {
      [...match.teamA, ...match.teamB].forEach(id => this.increment(playedCounts, id));
    }));
    if ([...playedCounts.values()].some(count => count !== matchesPerPlayer)) {
      throw new Error('Os jogos não foram distribuídos igualmente entre os jogadores.');
    }
  }

  private expectedRounds(size: TournamentSize, courts: number, mixed = false): number {
    if (size === 24 && mixed) return courts === 3 ? 24 : 12;
    if (size === 24 && courts === 3) return 46;
    if (size === 10) return 10;
    if (size === 12 && courts === 2) return 12;
    return size - 1;
  }

  private pairKey(a: string, b: string): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  private increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) ?? 0) + 1); }
}
