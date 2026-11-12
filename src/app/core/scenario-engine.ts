/**
 * Scenario engine behind "Seu caminho".
 *
 * Every remaining match has two outcomes (team A wins / team B wins). The engine walks the possible futures,
 * keeping the real structure of the fixtures: partners win and lose together, opponents are coupled, and a
 * player's own games move the rivals' results at the same time.
 *
 *  - Up to `exactLimit` open matches every future is visited (Gray code, one flip per step): exact answers.
 *  - Beyond that a seeded Monte Carlo run gives estimates, while clinched/eliminated come from sound bounds.
 *
 * Ties in wins are treated as a fair draw among the tied athletes (the real tie-break is game balance,
 * head-to-head, then a draw); `tieShare` reports how often the outcome hinges on it.
 * Pure and deterministic: same input, same output. No Angular, no storage.
 */

export type GoalPlace = 1 | 2 | 3;
export type GoalStatus = 'clinched' | 'alive' | 'eliminated';

export interface EnginePlayer {
  id: string;
  wins: number;
}
export interface EngineMatch {
  id: string;
  round: number;
  teamA: readonly string[];
  teamB: readonly string[];
}

export interface EngineOptions {
  /** Visit every future when open matches <= this. Default 18 (262k futures). */
  exactLimit?: number;
  /** Monte Carlo runs when over the exact limit. Default 20000. */
  simulations?: number;
  seed?: number;
  /** Matches whose result is assumed (what-if). They are applied to the wins and leave the open set. */
  forced?: Readonly<Record<string, 'A' | 'B'>>;
}

interface EngineMatchImpact {
  matchId: string;
  round: number;
  teamA: readonly string[];
  teamB: readonly string[];
  /** The athlete plays in this match. */
  mine: boolean;
  /** Chance of the goal if team A / team B wins this match (0..1). */
  ifAWins: number;
  ifBWins: number;
  /** |ifAWins - ifBWins| : how many points of chance this single result moves. */
  swing: number;
  better: 'A' | 'B' | null;
}

interface EngineRivalImpact {
  playerId: string;
  /** Sum, over this rival's games that do not involve the athlete, of the chance gained when the rival loses. */
  totalGain: number;
  /** Average chance gained by one loss of the rival. */
  gainPerLoss: number;
  matches: number;
}

interface EngineGoalResult {
  goal: GoalPlace;
  probability: number;
  status: GoalStatus;
  /** Share of futures decided only by the tie-break. */
  tieShare: number;
  matchImpacts: EngineMatchImpact[];
  rivals: EngineRivalImpact[];
  /** Chance of the goal given the athlete wins exactly `wins` of the open matches that involve them. */
  byMyWins: { wins: number; probability: number }[];
}

export interface EngineResult {
  playerId: string;
  mode: 'exact' | 'simulated';
  futures: number;
  openMatches: number;
  /** Open matches that involve the athlete. */
  myOpenMatches: number;
  currentWins: number;
  bestPossibleWins: number;
  /** Probability of finishing in each place (index 0 = 1st). */
  placeDistribution: number[];
  expectedPlace: number;
  /** Best place still reachable (ties decided in the athlete's favor). */
  bestPlace: number;
  /** Worst place possible (ties decided against). Only exact when `mode` is 'exact'; otherwise a sound bound. */
  worstPlace: number;
  goals: Record<GoalPlace, EngineGoalResult>;
}

const GOALS: readonly GoalPlace[] = [1, 2, 3];

/** Chance of finishing within `goal` when `s` athletes finish strictly ahead and `t` are tied with the athlete. */
export function tieValue(s: number, t: number, goal: number): number {
  if (s + 1 > goal) return 0;
  if (s + t + 1 <= goal) return 1;
  return (goal - s) / (t + 1);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OpenMatch {
  id: string;
  round: number;
  teamA: number[];
  teamB: number[];
  meSide: -1 | 0 | 1;
}

export function projectScenarios(
  players: readonly EnginePlayer[],
  matches: readonly EngineMatch[],
  playerId: string,
  options: EngineOptions = {},
): EngineResult {
  const me = players.findIndex((player) => player.id === playerId);
  if (me < 0) throw new Error('Atleta fora do torneio.');
  const exactLimit = options.exactLimit ?? 18;
  const simulations = options.simulations ?? 20000;
  const forced = options.forced ?? {};
  const index = new Map(players.map((player, i) => [player.id, i] as const));
  const toIndexes = (ids: readonly string[]): number[] =>
    ids.map((id) => index.get(id)).filter((i): i is number => i !== undefined);

  const P = players.length;
  const base = Int32Array.from(players.map((player) => player.wins));
  const open: OpenMatch[] = [];
  const remaining = new Int32Array(P);
  let myOpenMatches = 0;
  for (const match of matches) {
    const a = toIndexes(match.teamA);
    const b = toIndexes(match.teamB);
    const pick = forced[match.id];
    if (pick) {
      for (const i of pick === 'A' ? a : b) base[i]++;
      continue;
    }
    const meSide: -1 | 0 | 1 = a.includes(me) ? 0 : b.includes(me) ? 1 : -1;
    if (meSide >= 0) myOpenMatches++;
    for (const i of [...a, ...b]) remaining[i]++;
    open.push({ id: match.id, round: match.round, teamA: a, teamB: b, meSide });
  }
  const R = open.length;
  const mode: 'exact' | 'simulated' = R <= exactLimit ? 'exact' : 'simulated';

  const goalSum = new Float64Array(4);
  const tieMass = new Float64Array(4);
  const dist = new Float64Array(P);
  const impactSum = new Float64Array(3 * R * 2);
  const impactCount = new Float64Array(R * 2);
  const byWinsSum = new Float64Array(3 * (myOpenMatches + 1));
  const byWinsCount = new Float64Array(myOpenMatches + 1);
  let futures = 0;
  let bestSeen = P;
  let worstSeen = 1;

  const wins = new Int32Array(P);
  const outcome = new Uint8Array(R); // 1 = team A wins, 0 = team B wins
  let myFree = 0;

  const record = (): void => {
    futures++;
    const mine = wins[me];
    let s = 0;
    let t = 0;
    for (let j = 0; j < P; j++) {
      if (j === me) continue;
      if (wins[j] > mine) s++;
      else if (wins[j] === mine) t++;
    }
    if (s + 1 < bestSeen) bestSeen = s + 1;
    if (s + t + 1 > worstSeen) worstSeen = s + t + 1;
    const share = 1 / (t + 1);
    for (let k = s; k <= s + t; k++) dist[k] += share;
    const v1 = tieValue(s, t, 1);
    const v2 = tieValue(s, t, 2);
    const v3 = tieValue(s, t, 3);
    goalSum[1] += v1;
    goalSum[2] += v2;
    goalSum[3] += v3;
    for (let goal = 1; goal <= 3; goal++) if (s + 1 <= goal && s + t + 1 > goal) tieMass[goal]++;
    const row = myOpenMatches + 1;
    byWinsSum[myFree] += v1;
    byWinsSum[row + myFree] += v2;
    byWinsSum[2 * row + myFree] += v3;
    byWinsCount[myFree]++;
    for (let i = 0; i < R; i++) {
      const side = outcome[i];
      impactCount[i * 2 + side]++;
      impactSum[i * 2 + side] += v1;
      impactSum[(R + i) * 2 + side] += v2;
      impactSum[(2 * R + i) * 2 + side] += v3;
    }
  };

  const apply = (match: OpenMatch, aWins: boolean, delta: number): void => {
    for (const i of aWins ? match.teamA : match.teamB) wins[i] += delta;
  };
  const isMyWin = (match: OpenMatch, aWins: boolean): boolean =>
    match.meSide === 0 ? aWins : match.meSide === 1 ? !aWins : false;

  if (mode === 'exact') {
    wins.set(base);
    myFree = 0;
    for (let i = 0; i < R; i++) {
      outcome[i] = 0;
      apply(open[i], false, 1);
      if (isMyWin(open[i], false)) myFree++;
    }
    record();
    const total = 2 ** R;
    for (let step = 1; step < total; step++) {
      // Gray code: exactly one match flips, the lowest set bit of `step`.
      const i = 31 - Math.clz32(step & -step);
      const wasA = outcome[i] === 1;
      apply(open[i], wasA, -1);
      apply(open[i], !wasA, 1);
      if (isMyWin(open[i], wasA)) myFree--;
      if (isMyWin(open[i], !wasA)) myFree++;
      outcome[i] = wasA ? 0 : 1;
      record();
    }
  } else {
    const random = mulberry32(options.seed ?? 20260101);
    for (let run = 0; run < simulations; run++) {
      wins.set(base);
      myFree = 0;
      for (let i = 0; i < R; i++) {
        const aWins = random() < 0.5;
        outcome[i] = aWins ? 1 : 0;
        apply(open[i], aWins, 1);
        if (isMyWin(open[i], aWins)) myFree++;
      }
      record();
    }
  }

  // Sound bounds: the only statements allowed when the futures were sampled.
  const myMax = base[me] + remaining[me];
  let aheadForSure = 0;
  let canReachMe = 0;
  for (let j = 0; j < P; j++) {
    if (j === me) continue;
    if (base[j] > myMax) aheadForSure++;
    if (base[j] + remaining[j] >= base[me]) canReachMe++;
  }
  const exact = mode === 'exact';
  const bestPlace = exact ? bestSeen : aheadForSure + 1;
  const worstPlace = exact ? worstSeen : canReachMe + 1;

  const statusFor = (goal: GoalPlace): GoalStatus => {
    if (bestPlace > goal) return 'eliminated';
    if (worstPlace <= goal) return 'clinched';
    return 'alive';
  };

  const goals = {} as Record<GoalPlace, EngineGoalResult>;
  for (const goal of GOALS) {
    const status = statusFor(goal);
    const impacts: EngineMatchImpact[] = open
      .map((match, i): EngineMatchImpact => {
        const a = impactCount[i * 2 + 1];
        const b = impactCount[i * 2];
        const ifAWins = a ? impactSum[((goal - 1) * R + i) * 2 + 1] / a : 0;
        const ifBWins = b ? impactSum[((goal - 1) * R + i) * 2] / b : 0;
        const diff = ifAWins - ifBWins;
        return {
          matchId: match.id,
          round: match.round,
          teamA: match.teamA.map((k) => players[k].id),
          teamB: match.teamB.map((k) => players[k].id),
          mine: match.meSide >= 0,
          ifAWins,
          ifBWins,
          swing: Math.abs(diff),
          better: Math.abs(diff) < 1e-9 ? null : diff > 0 ? 'A' : 'B',
        };
      })
      .sort((x, y) => y.swing - x.swing || x.round - y.round);

    const rivalAcc = new Map<number, { gain: number; matches: number }>();
    const impactById = new Map(impacts.map((item) => [item.matchId, item] as const));
    open.forEach((match) => {
      if (match.meSide >= 0) return;
      const impact = impactById.get(match.id);
      if (!impact) return;
      for (const [team, loseValue] of [
        [match.teamA, impact.ifBWins - impact.ifAWins],
        [match.teamB, impact.ifAWins - impact.ifBWins],
      ] as const) {
        for (const j of team) {
          const entry = rivalAcc.get(j) ?? { gain: 0, matches: 0 };
          entry.gain += Math.max(0, loseValue);
          entry.matches++;
          rivalAcc.set(j, entry);
        }
      }
    });
    const rivals: EngineRivalImpact[] = [...rivalAcc.entries()]
      .map(([j, entry]) => ({
        playerId: players[j].id,
        totalGain: entry.gain,
        gainPerLoss: entry.matches ? entry.gain / entry.matches : 0,
        matches: entry.matches,
      }))
      .filter((rival) => rival.totalGain > 0.005)
      .sort((x, y) => y.totalGain - x.totalGain);

    const byMyWins: { wins: number; probability: number }[] = [];
    for (let k = 0; k <= myOpenMatches; k++) {
      if (byWinsCount[k])
        byMyWins.push({ wins: k, probability: byWinsSum[(goal - 1) * (myOpenMatches + 1) + k] / byWinsCount[k] });
    }

    goals[goal] = {
      goal,
      probability: status === 'clinched' && exact ? 1 : status === 'eliminated' ? 0 : goalSum[goal] / futures,
      status,
      tieShare: tieMass[goal] / futures,
      matchImpacts: impacts,
      rivals,
      byMyWins,
    };
  }

  const placeDistribution = Array.from(dist, (value) => value / futures);
  return {
    playerId,
    mode,
    futures,
    openMatches: R,
    myOpenMatches,
    currentWins: base[me],
    bestPossibleWins: myMax,
    placeDistribution,
    expectedPlace: placeDistribution.reduce((sum, p, k) => sum + p * (k + 1), 0),
    bestPlace,
    worstPlace,
    goals,
  };
}
