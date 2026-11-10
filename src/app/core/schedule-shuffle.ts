import { Match, Round } from './models';

/** Returns a number in [0, 1). Injectable so tests can use a seeded source. */
export type RandomSource = () => number;

export function shuffled<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface ShuffleRoundsOptions {
  random?: RandomSource;
  /**
   * Consecutive rounds that must stay adjacent. Super 24 on 3 courts splits each complete round into two
   * half-rounds, and keeping them together preserves the points where everyone has played the same number
   * of matches (required by early finals).
   */
  blockSize?: number;
  /** Builds the id of a match from its final round number and court. */
  matchId: (roundNumber: number, match: Match) => string;
}

/**
 * Randomizes the order in which rounds are played and rotates courts so nobody is pinned to the same court.
 * Only round order and court numbers change: the matches, partners, opponents and rests of each round are kept,
 * so every balance guarantee of the generated schedule still holds.
 */
export function shuffleRoundsAndCourts(rounds: Round[], options: ShuffleRoundsOptions): Round[] {
  const random = options.random ?? Math.random;
  const ordered = orderRounds(rounds, Math.max(1, options.blockSize ?? 1), random);
  return bestCourtLayout(ordered, random).map((round, index) => {
    const number = index + 1;
    return { ...round, number, matches: round.matches.map(match => ({ ...match, id: options.matchId(number, match) })) };
  });
}

/**
 * Shuffles round blocks, then locally improves the order to avoid players resting in consecutive rounds
 * (a few random starts, keeping the best).
 */
function orderRounds(rounds: Round[], blockSize: number, random: RandomSource): Round[] {
  const blocks: Round[][] = [];
  for (let index = 0; index < rounds.length; index += blockSize) blocks.push(rounds.slice(index, index + blockSize));
  const randomOrder = (): Round[][] => shuffled(blocks, random).map(block => random() < 0.5 ? block : [...block].reverse());
  if (blocks.length < 2 || !rounds.some(round => round.restingPlayerIds.length)) return randomOrder().flat();

  const restSets = new Map(rounds.map(round => [round, new Set(round.restingPlayerIds)]));
  const consecutiveRests = (sequence: Round[]): number => {
    let total = 0;
    for (let index = 1; index < sequence.length; index++) {
      const previous = restSets.get(sequence[index - 1])!;
      for (const id of sequence[index].restingPlayerIds) if (previous.has(id)) total++;
    }
    return total;
  };

  let best: { order: Round[][]; cost: number } | null = null;
  for (let attempt = 0; attempt < ROUND_ORDER_ATTEMPTS && best?.cost !== 0; attempt++) {
    let order = randomOrder();
    let cost = consecutiveRests(order.flat());
    for (let step = 0; step < blocks.length * 100 && cost > 0; step++) {
      const candidate = [...order];
      const first = Math.floor(random() * candidate.length);
      const second = Math.floor(random() * candidate.length);
      const move = random();
      if (blockSize > 1 && move < 0.3) candidate[first] = [...candidate[first]].reverse();
      else if (move < 0.65) [candidate[first], candidate[second]] = [candidate[second], candidate[first]];
      else candidate.splice(second, 0, ...candidate.splice(first, 1));
      const candidateCost = consecutiveRests(candidate.flat());
      // Accepting equal-cost moves keeps the result varied between generations.
      if (candidateCost <= cost) {
        order = candidate;
        cost = candidateCost;
      }
    }
    if (!best || cost < best.cost) best = { order, cost };
  }
  return best!.order.flat();
}

const ROUND_ORDER_ATTEMPTS = 6;

/** Court balancing is a local search: a few random starts avoid leaving someone stuck on one court. */
function bestCourtLayout(rounds: Round[], random: RandomSource): Round[] {
  let best: { rounds: Round[]; cost: number } | null = null;
  for (let attempt = 0; attempt < COURT_LAYOUT_ATTEMPTS && best?.cost !== 0; attempt++) {
    const layout = assignCourts(rounds, random);
    if (!best || layout.cost < best.cost) best = layout;
  }
  return best!.rounds;
}

const COURT_LAYOUT_ATTEMPTS = 12;

/**
 * Spreads every player's matches as evenly as possible across the courts (minimizing, per player, the sum of
 * squared matches per court). A greedy pass with random tie-breaks gives each generation a different layout,
 * then each round is re-optimized against all the others until no round improves.
 */
function assignCourts(rounds: Round[], random: RandomSource): { rounds: Round[]; cost: number } {
  const roundPlayers = rounds.map(round => round.matches.map(match => [...match.teamA, ...match.teamB]));
  const courtCounts = new Map<string, number[]>();
  const assignment: number[][] = rounds.map(() => []);
  const update = (roundIndex: number, amount: 1 | -1): void => assignment[roundIndex].forEach((court, matchIndex) =>
    roundPlayers[roundIndex][matchIndex].forEach(id => {
      const counts = courtCounts.get(id) ?? [];
      counts[court] = (counts[court] ?? 0) + amount;
      courtCounts.set(id, counts);
    }));

  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
      const refining = pass > 0;
      if (refining) update(roundIndex, -1);
      const courtCount = rounds[roundIndex].matches.length;
      const cost = roundPlayers[roundIndex].map(ids => Array.from({ length: courtCount }, (_, court) =>
        ids.reduce((sum, id) => sum + (courtCounts.get(id)?.[court] ?? 0), 0)));
      const costOf = (permutation: number[]): number => {
        let total = 0;
        for (let matchIndex = 0; matchIndex < permutation.length; matchIndex++) total += cost[matchIndex][permutation[matchIndex]];
        return total;
      };

      // While refining, the current layout wins ties so the passes converge.
      let best = refining ? assignment[roundIndex] : [];
      let bestCost = refining ? costOf(best) : Number.POSITIVE_INFINITY;
      let ties = 0;
      for (const permutation of permutations(courtCount)) {
        const total = costOf(permutation);
        if (total < bestCost) {
          bestCost = total;
          best = permutation;
          ties = 1;
          improved ||= refining;
        } else if (!refining && total === bestCost && random() * ++ties < 1) {
          best = permutation;
        }
      }
      assignment[roundIndex] = best;
      update(roundIndex, 1);
    }
    if (pass > 0 && !improved) break;
  }

  // Excess over a perfectly even spread (each player as close as possible to matches / courts on every court).
  let cost = 0;
  for (const counts of courtCounts.values()) {
    const courts = rounds[0].matches.length;
    const played = counts.reduce((sum, count) => sum + (count ?? 0), 0);
    const low = Math.floor(played / courts);
    const ideal = low * low * courts + (played % courts) * (2 * low + 1);
    cost += counts.reduce((sum, count) => sum + (count ?? 0) ** 2, 0) - ideal;
  }
  return {
    cost,
    rounds: rounds.map((round, roundIndex) => ({
      ...round,
      matches: round.matches
        .map((match, matchIndex): Match => ({ ...match, court: assignment[roundIndex][matchIndex] + 1 }))
        .sort((a, b) => a.court - b.court)
    }))
  };
}

const permutationCache = new Map<number, number[][]>();
function permutations(size: number): number[][] {
  const cached = permutationCache.get(size);
  if (cached) return cached;
  const result: number[][] = [];
  const build = (prefix: number[], remaining: number[]): void => {
    if (!remaining.length) {
      result.push(prefix);
      return;
    }
    remaining.forEach((value, index) => build([...prefix, value], remaining.filter((_, other) => other !== index)));
  };
  build([], Array.from({ length: size }, (_, index) => index));
  permutationCache.set(size, result);
  return result;
}
