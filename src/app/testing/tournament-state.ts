import storedFixture from '../../../tests/fixtures/persisted/tournament/v1.json';
import type { Match, Player, Round, TournamentState } from '../core/models';
import { parseTournamentCore } from '../shared/parsers/rpc-responses';

/** A Super 8 with no schedule; pass what the test cares about. */
export function tournamentState(overrides: Partial<TournamentState> = {}): TournamentState {
  return {
    version: 1,
    name: 'Teste',
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players: [],
    rounds: [],
    createdAt: '2026-11-13T10:00:00.000Z',
    ...overrides,
  };
}

/** Players `p1..pN` named `Ana`, `Bia`, ... in that order. */
export function namedPlayers(count: number, gender?: Player['gender']): Player[] {
  const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana', 'Ivo', 'Juca', 'Kika', 'Lia'];
  return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: names[i] ?? `J${i + 1}`, gender }));
}

/** A match between two pairs; scores default to unplayed. */
export function match(
  id: string,
  teamA: [string, string],
  teamB: [string, string],
  scoreA: number | null = null,
  scoreB: number | null = null,
  extra: Partial<Match> = {},
): Match {
  return { id, court: 1, teamA, teamB, scoreA, scoreB, ...extra };
}

export function round(number: number, matches: Match[], restingPlayerIds: string[] = []): Round {
  return { number, matches, restingPlayerIds };
}

/**
 * The tournament captured from the app (tests/fixtures/persisted/tournament/v1.json): a Super 8 with 7 rounds and
 * one match played. Parsed with the RPC schema, so it is typed without a cast. A fresh copy on every call.
 */
export function storedTournament(): TournamentState {
  return parseTournamentCore({ id: 'fixture', status: 'active', state: structuredClone(storedFixture) }).state;
}
