import { describe, expect, it } from 'vitest';
import type { PlayerStanding, TournamentState } from '../../core/models';
import {
  fixedPairs8State,
  groups20State,
  groups24State,
  identicalGroups,
  settleAllTies,
  strongerPairWins,
} from '../../testing/groups20';
import { match, namedPlayers, round, storedTournament, tournamentState } from '../../testing/tournament-state';
import { qualificationField } from './group-qualification';
import { criterionBetween, decidingList, placeExplanation, rankingRules } from './ranking-explanation';
import { compareStandingCriteria } from './standings';

const DRAWN_AT = '2026-11-13T10:00:00.000Z';

/** Six players: p3 and p5 tied (they never met), p2 beat p1 directly, p4 and p6 tied; m4 still has no score. */
function sixPlayers(overrides: Partial<TournamentState> = {}): TournamentState {
  return tournamentState({
    size: 8,
    players: namedPlayers(6),
    rounds: [
      round(1, [match('m1', ['p2', 'p3'], ['p1', 'p4'], 4, 3)], ['p5', 'p6']),
      round(2, [match('m2', ['p1', 'p5'], ['p4', 'p6'], 4, 3)], ['p2', 'p3']),
      round(3, [match('m3', ['p3', 'p5'], ['p2', 'p6'], 4, 3), match('m4', ['p1', 'p4'], ['p2', 'p3'])], []),
    ],
    ...overrides,
  });
}

function standing(overrides: Partial<PlayerStanding>): PlayerStanding {
  return {
    playerId: 'x',
    name: 'X',
    setsWon: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameBalance: 0,
    rests: 0,
    matchesPlayed: 0,
    ...overrides,
  };
}

describe('criterionBetween', () => {
  it('names the first criterion that differs, with both values', () => {
    const a = standing({ setsWon: 2, gameBalance: 3, gamesFor: 10 });
    expect(criterionBetween(a, standing({ setsWon: 1, gameBalance: 9 }))).toEqual({
      kind: 'criterion',
      criterion: 'wins',
      above: 2,
      below: 1,
    });
    expect(criterionBetween(a, standing({ setsWon: 2, gameBalance: 1 }))).toMatchObject({
      criterion: 'balance',
      above: 3,
      below: 1,
    });
    expect(criterionBetween(a, standing({ setsWon: 2, gameBalance: 3, gamesFor: 8 }))).toMatchObject({
      criterion: 'gamesFor',
      above: 10,
      below: 8,
    });
    expect(criterionBetween(a, { ...a, playerId: 'y' })).toBeNull();
  });
});

describe('placeExplanation, one overall ranking', () => {
  it('explains a place by a criterion above and by head-to-head below', () => {
    // Order: p3, p5 (tied), p2, p1 (p2 beat p1), p4, p6.
    const explanation = placeExplanation(sixPlayers(), 'p2')!;
    expect(explanation).toMatchObject({ list: 'overall', place: 3, size: 6, slots: null, inside: null });
    expect(explanation.provisional).toBe(true);
    expect(explanation.group).toBeNull();
    expect(explanation.above).toMatchObject({
      scope: 'list',
      place: 2,
      separation: { kind: 'criterion', criterion: 'wins', above: 2, below: 1 },
    });
    expect(explanation.below?.standing.playerId).toBe('p1');
    expect(explanation.below?.separation).toEqual({ kind: 'headToHead', tiedCount: 2, above: 1, below: 0 });
  });

  it('says a tie in the finalist places still needs a draw, and shows the draw once recorded', () => {
    expect(placeExplanation(sixPlayers(), 'p3')!.below?.separation).toEqual({ kind: 'tied', needsDraw: true });
    const drawn = sixPlayers({
      tieBreakDraws: [{ playerIds: ['p3', 'p5'], order: ['p5', 'p3'], createdAt: DRAWN_AT }],
    });
    const explanation = placeExplanation(drawn, 'p5')!;
    expect(explanation.place).toBe(1);
    expect(explanation.below?.separation).toEqual({
      kind: 'draw',
      drawnAt: DRAWN_AT,
      crossGroup: false,
      groupOrderKept: false,
    });
  });

  it('is null before the schedule exists and for a player who is not in the tournament', () => {
    expect(placeExplanation(tournamentState({ players: namedPlayers(8) }), 'p1')).toBeNull();
    expect(placeExplanation(sixPlayers(), 'nobody')).toBeNull();
  });

  it('has no cut when every athlete reaches the finals', () => {
    const state = storedTournament();
    const explanation = placeExplanation(state, state.players[0].id)!;
    expect(explanation).toMatchObject({ list: 'overall', size: 8, slots: null, inside: null });
  });

  it('24 in groups: the top 8 of the overall ranking, with the group named but not deciding', () => {
    const state = groups24State(2, strongerPairWins);
    const list = decidingList(state);
    expect(list).toMatchObject({ kind: 'overall', slots: 8 });
    expect(list.entries).toHaveLength(24);
    const eighth = placeExplanation(state, list.entries[7].playerId)!;
    const ninth = placeExplanation(state, list.entries[8].playerId)!;
    expect(eighth).toMatchObject({ place: 8, inside: true, provisional: false });
    expect(ninth).toMatchObject({ place: 9, inside: false });
    expect(ninth.group).toMatchObject({ place: null, status: null });
    expect(ninth.group?.name).toMatch(/^Grupo [A-F]$/);
    expect(ninth.above?.standing.playerId).toBe(list.entries[7].playerId);
  });

  it('asks for a draw only when the tied set reaches into the finalist places', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = groups24State(seed, () => [6, 4]);
      const entries = decidingList(state).entries;
      for (const row of entries) {
        const below = placeExplanation(state, row.playerId)!.below;
        if (below?.separation.kind !== 'tied') continue;
        const firstOfTie = entries.findIndex((other) => compareStandingCriteria(other, row) === 0);
        expect(below.separation.needsDraw).toBe(firstOfTie < 8);
      }
    }
  });

  it('fixed pairs: the neighbours are other pairs, never the partner', () => {
    const { state, pairs } = fixedPairs8State(3);
    for (const player of state.players) {
      const explanation = placeExplanation(state, player.id)!;
      const partner = pairs.find((pair) => pair.includes(player.id))!.find((id) => id !== player.id);
      expect(explanation.above?.standing.playerId).not.toBe(partner);
      expect(explanation.below?.standing.playerId).not.toBe(partner);
    }
  });

  it('mixed early finals: one list per gender decides', () => {
    const men = namedPlayers(12, 'male');
    const women = namedPlayers(24, 'female').slice(12);
    const state = tournamentState({
      size: 24,
      courts: 3,
      doublesFormat: 'mixed',
      earlyFinalsEnabled: true,
      players: [...men, ...women],
      rounds: [round(1, [match('m1', ['p1', 'p13'], ['p2', 'p14'], 6, 2)])],
    });
    const male = decidingList(state, 'male');
    expect(male).toMatchObject({ kind: 'male', slots: 8 });
    expect(male.entries).toHaveLength(12);
    expect(placeExplanation(state, 'p13')).toMatchObject({ list: 'female', place: 1, inside: true });
  });
});

describe('placeExplanation, the 20-player format', () => {
  it('compares a qualifier with the seed neighbours and a 4th place inside the group', () => {
    const state = groups20State(5, 3, strongerPairWins);
    const field = qualificationField(state);
    const seed = field.qualification.qualifiers[4];
    const qualifier = placeExplanation(state, seed.playerId)!;
    expect(qualifier).toMatchObject({ list: 'qualification', place: 5, size: 20, slots: 12, inside: true });
    expect(qualifier.group?.status).not.toBe('out');
    expect(qualifier.above).toMatchObject({ scope: 'list', place: 4 });
    expect(qualifier.below).toMatchObject({ scope: 'list', place: 6 });

    const fourth = field.qualification.byGroup[0].rows[3].standing;
    const explanation = placeExplanation(state, fourth.playerId)!;
    expect(explanation).toMatchObject({ inside: false, group: { place: 4, status: 'out' } });
    expect(explanation.above).toMatchObject({ scope: 'group', place: 3 });
    expect(explanation.below).toMatchObject({ scope: 'group', place: 5 });
  });

  it('compares a third place that missed out with the last third place that got in', () => {
    const state = groups20State(4, 3, strongerPairWins);
    const field = qualificationField(state);
    const missed = field.missedThirds[0];
    const explanation = placeExplanation(state, missed.playerId)!;
    expect(explanation).toMatchObject({ inside: false, place: 13, group: { place: 3, status: 'out' } });
    expect(explanation.above?.standing.playerId).toBe(field.qualification.thirdsRanked[1].playerId);
    expect(explanation.below?.standing.playerId).toBe(field.missedThirds[1].playerId);
  });

  it('describes a draw across groups for the whole tied set', () => {
    const open = identicalGroups();
    const tiedThird = qualificationField(open).missedThirds[0];
    expect(placeExplanation(open, tiedThird.playerId)!.above?.separation).toEqual({ kind: 'tied', needsDraw: true });

    const state = settleAllTies(identicalGroups());
    const missed = qualificationField(state).missedThirds[0];
    const separation = placeExplanation(state, missed.playerId)!.above?.separation;
    expect(separation).toMatchObject({ kind: 'draw', crossGroup: true, drawnAt: '2026-11-18T10:00:00.000Z' });
  });

  it('names the qualification rule when a runner-up with weaker numbers is in and a third place is not', () => {
    // Group E: the 1st place wins every match 6-0, so its three others tie on 1 win and -6, weaker than the thirds
    // of the other groups (1 win, -4). The group's 2nd place is in anyway; the thirds compete for two places.
    const state = settleAllTies(
      identicalGroups((group) =>
        group === 4
          ? [
              [6, 0],
              [6, 0],
              [6, 0],
            ]
          : undefined,
      ),
    );
    const field = qualificationField(state);
    const twelfth = field.qualification.qualifiers[11];
    expect(field.groupOf.get(twelfth.playerId)).toMatchObject({ name: 'Grupo E', place: 2 });
    const explanation = placeExplanation(state, twelfth.playerId)!;
    expect(explanation.below?.separation).toEqual({ kind: 'qualificationRule', abovePlace: 2, belowPlace: 3 });

    // Inside group E the three tied athletes were drawn: the 4th place is behind the 3rd by that draw.
    const groupE = field.qualification.byGroup[4];
    const fourth = placeExplanation(state, groupE.rows[3].standing.playerId)!;
    expect(fourth.above?.separation).toMatchObject({ kind: 'draw', crossGroup: false });
  });
});

describe('rankingRules', () => {
  it('describes the 20-player formats with their numbers', () => {
    expect(rankingRules(groups20State(5))).toMatchObject({
      variant: 'groups20',
      groupCount: 4,
      groupSize: 5,
      matchesEach: 4,
      slots: 12,
      directSlots: 8,
      thirdSlots: 4,
      pairing: 'crossed',
    });
    expect(rankingRules({ ...groups20State(4), finalsPairing: 'seededDraw' })).toMatchObject({
      groupCount: 5,
      groupSize: 4,
      matchesEach: 3,
      directSlots: 10,
      thirdSlots: 2,
      pairing: 'seededDraw',
    });
  });

  it('describes the top 8 formats and the mixed finals', () => {
    expect(rankingRules(groups24State())).toMatchObject({
      variant: 'top',
      groupTournament: true,
      groupCount: 6,
      groupSize: 4,
      matchesEach: 3,
      slots: 8,
    });
    expect(rankingRules(storedTournament())).toMatchObject({ variant: 'top', groupTournament: false, slots: 8 });
    const mixed = tournamentState({ size: 24, courts: 3, doublesFormat: 'mixed', earlyFinalsEnabled: true });
    expect(rankingRules(mixed)).toMatchObject({ variant: 'mixed', slots: 8 });
  });
});
