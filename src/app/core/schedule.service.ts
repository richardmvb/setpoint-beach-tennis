import { Injectable } from '@angular/core';
import { Match, Player, Round, TournamentSize } from './models';

type PartnerTeam = [string, string];
type TeamMatch = [PartnerTeam, PartnerTeam];

interface RoundOption {
  matches: Match[];
  restingPlayerIds: string[];
  opponentKeys: string[];
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  generate(players: Player[], size: TournamentSize, courts: number, roundCount: number, mixed = false): Round[] {
    if (players.length !== size) throw new Error(`O Super ${size} exige exatamente ${size} jogadores.`);
    if (new Set(players.map(player => player.id)).size !== players.length) {
      throw new Error('Cada jogador precisa ter um identificador único.');
    }
    const expectedRounds = this.expectedRounds(size, courts);
    const allowedCourts = size === 24 ? [3, 6] : size === 12 ? [2, 3] : [2];
    if (roundCount !== expectedRounds) {
      throw new Error(`O Super ${size} precisa de exatamente ${expectedRounds} rodadas.`);
    }
    if (!Number.isInteger(courts) || !allowedCourts.includes(courts)) {
      throw new Error(`O Super ${size} permite ${allowedCourts.join(' ou ')} quadras sem comprometer o equilíbrio dos jogos.`);
    }

    if (size === 24) return this.generateSuper24(players, mixed, courts);

    const partnerRounds = mixed
      ? this.createMixedPartnerRounds(players, expectedRounds)
      : this.createPartnerRounds(players);
    const searchRoundCount = partnerRounds.length;
    const courtPlan = Array(searchRoundCount).fill(courts);
    const optionsByRound = partnerRounds.map((teams, index) => this.createRoundOptions(teams, index, courtPlan[index]));
    const totalPairs = size * (size - 1) / 2;
    const equalizingRoundNeeded = !mixed && (size === 10 || (size === 12 && courts === 2));
    const restsPerRound = size - courts * 4;
    const maxRestCount = equalizingRoundNeeded ? restsPerRound
      : mixed && restsPerRound > 0 ? Math.ceil(searchRoundCount * restsPerRound / size) : 0;

    for (let attempt = 0; attempt < 1000; attempt++) {
      const opponentCounts = new Map<string, number>();
      const restCounts = new Map(players.map(player => [player.id, 0]));
      const selected = this.createInitialSelection(optionsByRound, restCounts, maxRestCount);
      selected.forEach(option => this.applyOption(option, 1, opponentCounts, restCounts));
      const steps = size * 800;

      for (let step = 0; step < steps; step++) {
        const roundIndex = Math.floor(Math.random() * searchRoundCount);
        const previous = selected[roundIndex];
        const candidates = optionsByRound[roundIndex];
        const candidate = candidates[Math.floor(Math.random() * candidates.length)];
        if (candidate === previous) continue;

        const previousCost = this.scheduleCost(opponentCounts, restCounts, totalPairs);
        this.applyOption(previous, -1, opponentCounts, restCounts);
        if (candidate.restingPlayerIds.some(id => (restCounts.get(id) ?? 0) >= maxRestCount)) {
          this.applyOption(previous, 1, opponentCounts, restCounts);
          continue;
        }
        this.applyOption(candidate, 1, opponentCounts, restCounts);
        const candidateCost = this.scheduleCost(opponentCounts, restCounts, totalPairs);
        const temperature = 30 * (1 - step / steps) + 0.1;

        if (candidateCost <= previousCost || Math.random() < Math.exp((previousCost - candidateCost) / temperature)) {
          selected[roundIndex] = candidate;
          if (opponentCounts.size === totalPairs) {
            const baseRounds = this.toRounds(selected);
            const finalRound = equalizingRoundNeeded
              ? this.createEqualizingRound(players, baseRounds, courts)
              : null;
            if (equalizingRoundNeeded && !finalRound) continue;
            const rounds = finalRound ? [...baseRounds, finalRound] : baseRounds;
            try {
              this.validateSchedule(players, size, courts, rounds, mixed);
              return rounds;
            } catch {
              continue;
            }
          }
        } else {
          this.applyOption(candidate, -1, opponentCounts, restCounts);
          this.applyOption(previous, 1, opponentCounts, restCounts);
        }
      }

      if (equalizingRoundNeeded) {
        const baseRounds = this.toRounds(selected);
        const finalRound = this.createEqualizingRound(players, baseRounds, courts);
        if (finalRound) {
          try {
              this.validateSchedule(players, size, courts, [...baseRounds, finalRound], mixed);
            return [...baseRounds, finalRound];
          } catch {
            continue;
          }
        }
      }
    }

    throw new Error('Não foi possível montar uma tabela sem repetir parceiros e com todos os confrontos. Tente gerar novamente.');
  }

  private generateSuper24(players: Player[], mixed = false, courts = 6): Round[] {
    // A cobertura de parceiros é a mesma, mas a ordem é sorteada em cada tabela gerada.
    // Isso evita que os mesmos atletas iniciem sempre nas mesmas duplas.
    const partnerRounds = this.shuffle(mixed
      ? this.createMixedPartnerRounds(players, 23)
      : this.createPartnerRounds(players));
    const playerIds = players.map(player => player.id);
    const rounds = partnerRounds.length;

    for (let attempt = 0; attempt < 16; attempt++) {
      const selected = partnerRounds.map(teams => this.randomTeamMatches(teams));
      const opponents = new Map<string, number>();
      selected.forEach(matches => this.adjustOpponentCounts(this.opponentKeysForMatches(matches), 1, opponents));
      const steps = 24 * 2500;

      for (let step = 0; step < steps; step++) {
        const roundIndex = Math.floor(Math.random() * rounds);
        const previous = selected[roundIndex];
        const candidate = this.randomTeamMatches(partnerRounds[roundIndex]);
        const previousKeys = this.opponentKeysForMatches(previous);
        const candidateKeys = this.opponentKeysForMatches(candidate);
        if (previousKeys.every(key => candidateKeys.includes(key))) continue;

        const affected = new Set([...previousKeys, ...candidateKeys]);
        const oldCost = this.affectedOpponentCost(opponents, affected);
        this.adjustOpponentCounts(previousKeys, -1, opponents);
        this.adjustOpponentCounts(candidateKeys, 1, opponents);
        const newCost = this.affectedOpponentCost(opponents, affected);
        const temperature = 8 * (1 - step / steps) + 0.15;

        if (newCost <= oldCost || Math.random() < Math.exp((oldCost - newCost) / temperature)) {
          selected[roundIndex] = candidate;
          if (opponents.size === playerIds.length * (playerIds.length - 1) / 2) {
            const result = this.toSuper24Rounds(selected, courts, playerIds);
            this.validateSchedule(players, 24, courts, result, mixed);
            return result;
          }
        } else {
          this.adjustOpponentCounts(candidateKeys, -1, opponents);
          this.adjustOpponentCounts(previousKeys, 1, opponents);
        }
      }
    }

    throw new Error('Não foi possível distribuir os confrontos do Super 24. Gere a tabela novamente.');
  }

  private toSuper24Rounds(selected: TeamMatch[][], courts: number, playerIds: string[]): Round[] {
    const rounds: Round[] = [];
    const roundMatches = courts === 3 ? this.orderThreeCourtBatches(selected) : selected;
    roundMatches.forEach(matches => {
      const batches = [matches];
      batches.forEach(batch => {
        const activePlayerIds = new Set(batch.flatMap(([teamA, teamB]) => [...teamA, ...teamB]));
        const number = rounds.length + 1;
        rounds.push({
          number,
          matches: batch.map((match, matchIndex): Match => ({
            id: `r${number}-m${matchIndex + 1}`,
            court: matchIndex + 1,
            teamA: match[0],
            teamB: match[1],
            scoreA: null,
            scoreB: null
          })),
          restingPlayerIds: playerIds.filter(id => !activePlayerIds.has(id))
        });
      });
    });
    return rounds;
  }

  private orderThreeCourtBatches(selected: TeamMatch[][]): TeamMatch[][] {
    type BatchBlock = { first: TeamMatch[]; second: TeamMatch[] };
    const remaining: BatchBlock[] = selected.map(matches => ({ first: matches.slice(0, 3), second: matches.slice(3) }));
    const ordered: TeamMatch[][] = [];
    let previousActive = new Set<string>();
    while (remaining.length) {
      let bestIndex = 0; let reverse = false; let bestOverlap = Number.POSITIVE_INFINITY;
      for (let index = 0; index < remaining.length; index++) {
        for (const candidateReverse of [false, true]) {
          const first = candidateReverse ? remaining[index].second : remaining[index].first;
          const active = new Set(first.flatMap(([teamA, teamB]) => [...teamA, ...teamB]));
          let overlap = 0; active.forEach(playerId => { if (previousActive.has(playerId)) overlap++; });
          if (overlap < bestOverlap || (overlap === bestOverlap && Math.random() < .5)) {
            bestOverlap = overlap; bestIndex = index; reverse = candidateReverse;
          }
        }
      }
      const [block] = remaining.splice(bestIndex, 1);
      const first = reverse ? block.second : block.first;
      const second = reverse ? block.first : block.second;
      ordered.push(first, second);
      previousActive = new Set(second.flatMap(([teamA, teamB]) => [...teamA, ...teamB]));
    }
    return ordered;
  }

  private randomTeamMatches(teams: PartnerTeam[]): TeamMatch[] {
    const shuffled = this.shuffle(teams);
    return Array.from({ length: shuffled.length / 2 }, (_, index) => [
      shuffled[index * 2], shuffled[index * 2 + 1]
    ] as TeamMatch);
  }

  private opponentKeysForMatches(matches: TeamMatch[]): string[] {
    return matches.flatMap(([teamA, teamB]) => teamA.flatMap(a => teamB.map(b => this.pairKey(a, b))));
  }

  private adjustOpponentCounts(keys: string[], amount: 1 | -1, counts: Map<string, number>): void {
    keys.forEach(key => {
      const next = (counts.get(key) ?? 0) + amount;
      if (next === 0) counts.delete(key);
      else counts.set(key, next);
    });
  }

  private affectedOpponentCost(counts: Map<string, number>, keys: Set<string>): number {
    return [...keys].reduce((sum, key) => sum + this.opponentCountCost(counts.get(key) ?? 0), 0);
  }

  private opponentDeviationCost(counts: Map<string, number>, playerIds: string[]): number {
    let total = 0;
    for (let first = 0; first < playerIds.length; first++) {
      for (let second = first + 1; second < playerIds.length; second++) {
        total += this.opponentCountCost(counts.get(this.pairKey(playerIds[first], playerIds[second])) ?? 0);
      }
    }
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

  private createRoundOptions(teams: PartnerTeam[], roundIndex: number, courtCount: number): RoundOption[] {
    const options: RoundOption[] = [];
    const activeTeamCount = courtCount * 2;
    for (const activeTeams of this.chooseTeams(teams, activeTeamCount)) {
      const activeIds = new Set(activeTeams.flat());
      const restingPlayerIds = teams.filter(team => !activeIds.has(team[0])).flat();
      for (const pairing of this.pairTeams(activeTeams)) {
        const matches = pairing.map(([teamA, teamB], matchIndex): Match => ({
          id: `r${roundIndex + 1}-m${matchIndex + 1}`,
          court: matchIndex + 1,
          teamA,
          teamB,
          scoreA: null,
          scoreB: null
        }));
        const opponentKeys = matches.flatMap(match => match.teamA.flatMap(a =>
          match.teamB.map(b => this.pairKey(a, b))));
        options.push({
          matches,
          restingPlayerIds,
          opponentKeys
        });
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

  private createInitialSelection(
    optionsByRound: RoundOption[][], restCounts: Map<string, number>, maxRestCount: number
  ): RoundOption[] {
    const plannedRests = new Map(restCounts);
    return optionsByRound.map(options => {
      const eligible = options.filter(option => option.restingPlayerIds.every(id => (plannedRests.get(id) ?? 0) < maxRestCount));
      const candidates = eligible.length ? eligible : options;
      let minimumRestCost = Number.POSITIVE_INFINITY;
      let bestOptions: RoundOption[] = [];
      for (const option of candidates) {
        const restCost = option.restingPlayerIds.reduce((sum, id) => {
          const count = plannedRests.get(id) ?? 0;
          return sum + (count + 1) * (count + 1) - count * count;
        }, 0);
        if (restCost < minimumRestCost) {
          minimumRestCost = restCost;
          bestOptions = [option];
        } else if (restCost === minimumRestCost) {
          bestOptions.push(option);
        }
      }
      const selected = bestOptions[Math.floor(Math.random() * bestOptions.length)];
      selected.restingPlayerIds.forEach(id => this.increment(plannedRests, id));
      return selected;
    });
  }

  private applyOption(
    option: RoundOption, amount: 1 | -1,
    opponents: Map<string, number>, rests: Map<string, number>
  ): void {
    option.opponentKeys.forEach(key => {
      const count = (opponents.get(key) ?? 0) + amount;
      if (count === 0) opponents.delete(key);
      else opponents.set(key, count);
    });
    option.restingPlayerIds.forEach(id => {
      rests.set(id, (rests.get(id) ?? 0) + amount);
    });
  }

  private scheduleCost(opponents: Map<string, number>, rests: Map<string, number>, totalPairs: number): number {
    const restCost = [...rests.values()].reduce((sum, count) => sum + count * count, 0);
    return (totalPairs - opponents.size) * 100 + restCost;
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

    for (const teams of this.pairPlayers(activeIds)) {
      if (teams.some(team => partnerCounts.has(this.pairKey(...team)))) continue;
      for (const pairing of this.pairTeams(teams)) {
        const finalOpponents = new Set(opponentCounts);
        pairing.forEach(([teamA, teamB]) => {
          for (const a of teamA) for (const b of teamB) finalOpponents.add(this.pairKey(a, b));
        });
        let allOpponentsMet = true;
        for (let first = 0; first < players.length; first++) {
          for (let second = first + 1; second < players.length; second++) {
            if (!finalOpponents.has(this.pairKey(players[first].id, players[second].id))) {
              allOpponentsMet = false;
            }
          }
        }
        if (!allOpponentsMet) continue;

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
    const partnerCounts = new Map<string, number>();
    const opponentCounts = new Map<string, number>();
    const restCounts = new Map(playerIds.map(id => [id, 0]));

    const expectedRounds = this.expectedRounds(size, courts);
    const expectedMatches = courts;
    if (rounds.length !== expectedRounds) throw new Error('Quantidade incorreta de rodadas.');
    for (const [roundIndex, round] of rounds.entries()) {
      if (round.number !== roundIndex + 1 || round.matches.length !== expectedMatches) {
        throw new Error('Rodada incompleta ou fora de ordem.');
      }
      const seen = new Set<string>();
      for (const match of round.matches) {
        if (match.teamA.length !== 2 || match.teamB.length !== 2) throw new Error('Partida inválida.');
        if (mixed && [match.teamA, match.teamB].some(team =>
          players.find(player => player.id === team[0])?.gender === players.find(player => player.id === team[1])?.gender)) {
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

    if ([...partnerCounts.values()].some(count => count > (mixed ? 2 : 1))) {
      throw new Error('Há uma dupla repetida.');
    }
    for (let first = 0; first < playerIds.length; first++) {
      for (let second = first + 1; second < playerIds.length; second++) {
        if (!opponentCounts.has(this.pairKey(playerIds[first], playerIds[second]))) {
          throw new Error('Há jogadores que ainda não se enfrentaram.');
        }
      }
    }
    if ((size === 10 || (size === 12 && courts === 2))
      && Math.max(...restCounts.values()) !== Math.min(...restCounts.values())) {
      throw new Error('Os descansos não foram distribuídos de forma equilibrada.');
    }
    const matchesPerPlayer = size === 10 || (size === 12 && courts === 2) ? 8 : size - 1;
    const playedCounts = new Map(playerIds.map(id => [id, 0]));
    rounds.forEach(round => round.matches.forEach(match => {
      [...match.teamA, ...match.teamB].forEach(id => this.increment(playedCounts, id));
    }));
    if ([...playedCounts.values()].some(count => count !== matchesPerPlayer)) {
      throw new Error('Os jogos não foram distribuídos igualmente entre os jogadores.');
    }
  }

  private expectedRounds(size: TournamentSize, courts: number): number {
    if (size === 24 && courts === 3) return 46;
    if (size === 10) return 10;
    if (size === 12 && courts === 2) return 12;
    return size - 1;
  }

  private pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }
  private increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) ?? 0) + 1); }
  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
