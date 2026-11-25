import type { FinalMatchKind, FinalStage, Match } from '../../core/models';
import { shownScore } from './final-score';
import type { FinalWinnerSide } from './scoring';

type Pair = readonly [string, string];

/** One side of a bracket cell: a known pair, the match that will fill it, a bye, or nothing known yet. */
export type BracketSlot =
  | {
      kind: 'pair';
      playerIds: Pair;
      seed: number | null;
      games: number | null;
      tieBreak: number | null;
      won: boolean;
    }
  | { kind: 'feed'; outcome: 'winner' | 'loser'; round: 'qf' | 'sf'; number: number }
  | { kind: 'bye' }
  | { kind: 'tbd' };

export interface BracketMatch {
  id: string;
  kind: FinalMatchKind | 'bye';
  number: number;
  state: 'done' | 'live' | 'ready' | 'tbd' | 'bye';
  winner: 1 | 2 | null;
  /** In the model's order: team A first. */
  slots: readonly [BracketSlot, BracketSlot];
}

export interface BracketView {
  /** Quartas (four cells, two of them byes in the 20-athlete format), semifinais, final. */
  columns: readonly [BracketMatch[], BracketMatch[], BracketMatch[]];
  thirdPlace: BracketMatch | null;
}

type Feed = Extract<BracketSlot, { kind: 'feed' }>;
const feed = (outcome: Feed['outcome'], round: Feed['round'], number: number): Feed => ({
  kind: 'feed',
  outcome,
  round,
  number,
});

interface Layout {
  /** The first column; `bye:<id>` is a synthesized bye node standing for the semifinal's first team. */
  first: readonly string[];
  /** Seeds of the pairs placed at the start, by match id (team A, team B). */
  seeds: Readonly<Record<string, readonly [number | null, number | null]>>;
  feeds: Readonly<Record<string, readonly [Feed, Feed]>>;
}

const FINAL_FEEDS: Layout['feeds'] = {
  'final-championship': [feed('winner', 'sf', 1), feed('winner', 'sf', 2)],
  'final-third-place': [feed('loser', 'sf', 1), feed('loser', 'sf', 2)],
};

const BYE_LAYOUT: Layout = {
  first: ['bye:final-sf-1', 'final-qfb-1', 'final-qfb-2', 'bye:final-sf-2'],
  seeds: {
    'final-sf-1': [1, null],
    'final-sf-2': [2, null],
    'final-qfb-1': [4, 5],
    'final-qfb-2': [3, 6],
  },
  feeds: {
    ...FINAL_FEEDS,
    'final-sf-1': [feed('winner', 'qf', 1), feed('winner', 'qf', 1)],
    'final-sf-2': [feed('winner', 'qf', 2), feed('winner', 'qf', 2)],
  },
};

const EIGHT_LAYOUT: Layout = {
  first: ['final-qf-1', 'final-qf-2', 'final-qf-3', 'final-qf-4'],
  seeds: {
    'final-qf-1': [1, 8],
    'final-qf-2': [4, 5],
    'final-qf-3': [2, 7],
    'final-qf-4': [3, 6],
  },
  feeds: {
    ...FINAL_FEEDS,
    'final-sf-1': [feed('winner', 'qf', 1), feed('winner', 'qf', 2)],
    'final-sf-2': [feed('winner', 'qf', 3), feed('winner', 'qf', 4)],
  },
};

const key = (pair: Pair): string => pair.join('|');
const known = (pair: Pair): boolean => !!pair[0] && !!pair[1];

function pickLayout(byId: ReadonlyMap<string, Match>): Layout | null {
  const has = (...ids: string[]): boolean => ids.every((id) => byId.has(id));
  if (!has('final-sf-1', 'final-sf-2', 'final-championship')) return null;
  if (has('final-qfb-1', 'final-qfb-2')) return BYE_LAYOUT;
  if (has('final-qf-1', 'final-qf-2', 'final-qf-3', 'final-qf-4')) return EIGHT_LAYOUT;
  return null;
}

/**
 * The knockout tree a viewer sees, derived from the finals. Null for formats without a tree (Super, mixed direct).
 * The layout is found by match id, the same contract `FinalsService.updatePodium` relies on. Bye nodes are
 * synthesized here and never persisted. The winner rule is passed in because live finals use the score engine.
 */
export function finalsBracket(finals: FinalStage, winnerSide: FinalWinnerSide): BracketView | null {
  const byId = new Map(finals.matches.map((match) => [match.id, match]));
  const layout = pickLayout(byId);
  if (!layout) return null;

  const seedOf = new Map<string, number>();
  for (const [id, [a, b]] of Object.entries(layout.seeds)) {
    const match = byId.get(id);
    if (!match) continue;
    if (a !== null && match.teamA[0]) seedOf.set(key(match.teamA), a);
    if (b !== null && match.teamB[0]) seedOf.set(key(match.teamB), b);
  }

  const pairSlot = (team: Pair, games: number | null | undefined, tieBreak: number | null | undefined, won: boolean) =>
    ({
      kind: 'pair',
      playerIds: [team[0], team[1]],
      seed: seedOf.get(key(team)) ?? null,
      games: games ?? null,
      tieBreak: tieBreak ?? null,
      won,
    }) satisfies BracketSlot;

  const cell = (match: Match): BracketMatch => {
    const winner = winnerSide(match);
    const ready = known(match.teamA) && known(match.teamB);
    const feeds = layout.feeds[match.id];
    const shown = shownScore(match);
    const slot = (side: 0 | 1): BracketSlot => {
      const team = side === 0 ? match.teamA : match.teamB;
      if (!team[0]) return feeds?.[side] ?? { kind: 'tbd' };
      return pairSlot(
        team,
        side === 0 ? shown.a : shown.b,
        side === 0 ? shown.tieBreakA : shown.tieBreakB,
        winner === side + 1,
      );
    };
    const live = match.finalKind === 'championship' && match.livePoints !== undefined && ready && winner === null;
    return {
      id: match.id,
      kind: match.finalKind ?? 'quarterfinal',
      number: Number(/-(\d+)$/.exec(match.id)?.[1] ?? 1),
      state: winner ? 'done' : live ? 'live' : ready ? 'ready' : 'tbd',
      winner,
      slots: [slot(0), slot(1)],
    };
  };

  const byeCell = (semifinal: Match): BracketMatch => ({
    id: `bye-${semifinal.id.slice(-1)}`,
    kind: 'bye',
    number: Number(semifinal.id.slice(-1)),
    state: 'bye',
    winner: null,
    slots: [pairSlot(semifinal.teamA, null, null, false), { kind: 'bye' }],
  });

  const first = layout.first.map((id) =>
    id.startsWith('bye:') ? byeCell(byId.get(id.slice(4))!) : cell(byId.get(id)!),
  );
  const third = byId.get('final-third-place');
  return {
    columns: [
      first,
      [cell(byId.get('final-sf-1')!), cell(byId.get('final-sf-2')!)],
      [cell(byId.get('final-championship')!)],
    ],
    thirdPlace: third ? cell(third) : null,
  };
}
