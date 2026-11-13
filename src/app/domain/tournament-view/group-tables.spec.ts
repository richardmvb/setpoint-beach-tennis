import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
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
});
