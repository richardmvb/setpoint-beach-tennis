import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
import { groups20State, strongerPairWins } from '../../testing/groups20';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { groupTables } from './group-tables';
import { rankedStandingGroups } from './standings';

function tables(state: TournamentState) {
  return groupTables(state, rankedStandingGroups(state).flat());
}

describe('groupTables', () => {
  it('ranks each group by sets won, game balance, games won, then name', () => {
    const state = tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'rotating',
      players: namedPlayers(4),
      groups: [{ id: 'g1', name: 'Grupo A', playerIds: ['p1', 'p2', 'p3', 'p4'] }],
      rounds: [round(1, [match('a', ['p3', 'p4'], ['p1', 'p2'], 4, 2)])],
    });
    const [table] = tables(state);
    expect(table.name).toBe('Grupo A');
    // Caio and Duda won 4-2; Ana and Bia lost and are ordered by name.
    expect(table.entries.map((entry) => entry.label)).toEqual(['Caio', 'Duda', 'Ana', 'Bia']);
    expect(table.entries[0]).toMatchObject({
      playerIds: ['p3'],
      setsWon: 1,
      gamesFor: 4,
      gamesAgainst: 2,
      gameBalance: 2,
    });
  });

  it('follows the overall order: a group tie that head-to-head decides is not left to the names', () => {
    // Caio (p3) and Edu (p5) tie and never met; Ana (p1) and Bia (p2) each win once 4-3 / lose once 3-4 (1 set, 7-7),
    // and Bia beat Ana directly, so Bia comes first although Ana comes first alphabetically.
    const state = tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'rotating',
      players: namedPlayers(6),
      groups: [{ id: 'g1', name: 'Grupo A', playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] }],
      rounds: [
        round(1, [match('m1', ['p2', 'p3'], ['p1', 'p4'], 4, 3)], ['p5', 'p6']),
        round(2, [match('m2', ['p1', 'p5'], ['p4', 'p6'], 4, 3)], ['p2', 'p3']),
        round(3, [match('m3', ['p3', 'p5'], ['p2', 'p6'], 4, 3)], ['p1', 'p4']),
      ],
    });
    const [table] = tables(state);
    expect(table.entries.map((entry) => entry.label)).toEqual(['Caio', 'Edu', 'Bia', 'Ana', 'Duda', 'Fabi']);
  });

  it('shows a fixed pair as one row with both names', () => {
    const state = tournamentState({
      tournamentMode: 'groups',
      groupFormat: 'fixed',
      players: namedPlayers(4),
      groups: [
        {
          id: 'g1',
          name: 'Grupo A',
          playerIds: ['p1', 'p2', 'p3', 'p4'],
          fixedPairs: [
            ['p1', 'p2'],
            ['p3', 'p4'],
          ],
        },
      ],
      rounds: [round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 3)])],
    });
    expect(tables(state)[0].entries.map((entry) => [entry.label, entry.setsWon])).toEqual([
      ['Ana + Bia', 1],
      ['Caio + Duda', 0],
    ]);
  });

  it('fails loudly when a group names a player the tournament does not have', () => {
    const state = tournamentState({
      tournamentMode: 'groups',
      players: namedPlayers(2),
      groups: [{ id: 'g1', name: 'Grupo A', playerIds: ['p1', 'ghost'] }],
    });
    expect(() => tables(state)).toThrow('Jogador não encontrado no ranking do grupo.');
  });

  it('is empty without groups', () => {
    expect(tables(tournamentState())).toEqual([]);
  });

  it('shows no qualification mark while a group match is still open', () => {
    const state = groups20State(4, 3, strongerPairWins);
    const open = {
      ...state,
      rounds: state.rounds.map((round, index) =>
        index === 0
          ? { ...round, matches: [{ ...round.matches[0], scoreA: null, scoreB: null }, ...round.matches.slice(1)] }
          : round,
      ),
    };
    const all = groupTables(open, rankedStandingGroups(open).flat());
    expect(all.flatMap((table) => table.entries).every((entry) => entry.status === undefined)).toBe(true);
  });

  it('marks who goes on to the finals in the 20-player format, and nothing in the others', () => {
    const state = groups20State(4, 3, strongerPairWins);
    const all = groupTables(state, rankedStandingGroups(state).flat());
    const statuses = all.flatMap((table) => table.entries.map((entry) => entry.status));
    expect(statuses.filter((status) => status === 'direct')).toHaveLength(10);
    expect(statuses.filter((status) => status === 'bestThird')).toHaveLength(2);
    expect(statuses.filter((status) => status === 'out')).toHaveLength(8);
    expect(all.every((table) => table.entries[0].status === 'direct')).toBe(true);
    const plain = tables(
      tournamentState({
        tournamentMode: 'groups',
        players: namedPlayers(4),
        groups: [{ id: 'g', name: 'G', playerIds: ['p1', 'p2', 'p3', 'p4'] }],
      }),
    );
    expect(plain[0].entries.every((entry) => entry.status === undefined)).toBe(true);
  });
});
