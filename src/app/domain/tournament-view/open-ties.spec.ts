import { describe, expect, it } from 'vitest';
import type { TournamentState } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { withTieDraw } from '../tournament-play/tie-draw';
import { openTies } from './open-ties';
import { placeExplanation } from './ranking-explanation';
import { createStandingsMemo, rankedStandingGroups } from './standings';

const men = namedPlayers(12, 'male').map((player) => player.id);
const women = namedPlayers(24, 'female')
  .slice(12)
  .map((player) => player.id);

/**
 * A mixed Super 24 with early finals (eight men and eight women go on): Ana (p1) and p13 win the only match against
 * Bia (p2) and p14, and the twenty others never played, so ten men and ten women tie from the second place of their
 * list on. In the overall ranking Ana and p13 also tie with each other, a tie the finals never ask about.
 */
function mixed(): TournamentState {
  return tournamentState({
    size: 24,
    courts: 3,
    doublesFormat: 'mixed',
    earlyFinalsEnabled: true,
    players: [...namedPlayers(12, 'male'), ...namedPlayers(24, 'female').slice(12)],
    rounds: [round(1, [match('m1', ['p1', 'p13'], ['p2', 'p14'], 6, 2)])],
  });
}

const idsOf = (state: TournamentState) => openTies(state).map((tie) => tie.players.map((row) => row.playerId).sort());
const sorted = (ids: string[]) => [...ids].sort();
const untouched = (ids: string[], played: string[]) => ids.filter((id) => !played.includes(id));

describe('openTies, mixed finals', () => {
  it('asks about each gender list on its own, and never about a man tied with a woman', () => {
    const state = mixed();
    const ties = openTies(state);
    expect(ties.map(({ gender, firstPlace, spots }) => ({ gender, firstPlace, spots }))).toEqual([
      { gender: 'male', firstPlace: 2, spots: 7 },
      { gender: 'female', firstPlace: 2, spots: 7 },
    ]);
    expect(idsOf(state)).toEqual([sorted(untouched(men, ['p1', 'p2'])), sorted(untouched(women, ['p13', 'p14']))]);
  });

  it('orders a drawn gender inside the overall tie and then asks only about the other one', () => {
    const state = mixed();
    const tiedMen = openTies(state)[0].players.map((row) => row.playerId);
    const order = [...tiedMen].reverse();
    const drawn = withTieDraw(state, tiedMen, order, '2026-11-26T10:00:00.000Z');
    // The men keep their places in the overall tie (still one group with the women) but in the drawn order.
    const all = rankedStandingGroups(drawn).flat();
    expect(all.filter((row) => tiedMen.includes(row.playerId)).map((row) => row.playerId)).toEqual(order);
    expect(
      createStandingsMemo()(drawn)
        .male.slice(1, 11)
        .map((row) => row.playerId),
    ).toEqual(order);
    expect(openTies(drawn).map((tie) => tie.gender)).toEqual(['female']);
    // The explanation names the draw, and still says the women wait for theirs.
    expect(placeExplanation(drawn, order[0])?.below?.separation).toMatchObject({ kind: 'draw' });
    const woman = openTies(drawn)[0].players[0].playerId;
    expect(placeExplanation(drawn, woman)?.below?.separation).toEqual({ kind: 'tied', needsDraw: true });
  });

  it('takes an older draw over the whole tie as settling both genders', () => {
    const state = mixed();
    const group = rankedStandingGroups(state).find((tied) => tied.length === 20)!;
    const ids = group.map((row) => row.playerId);
    expect(openTies(withTieDraw(state, ids, [...ids].reverse(), '2026-11-26T10:00:00.000Z'))).toEqual([]);
  });
});

describe('openTies, overall ranking', () => {
  it('leaves the spots at the size of the tie when it sits inside the finalists', () => {
    const state = tournamentState({
      players: namedPlayers(8),
      rounds: [
        round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 4), match('m2', ['p5', 'p6'], ['p7', 'p8'], 4, 4)]),
      ],
    });
    expect(openTies(state)).toEqual([expect.objectContaining({ firstPlace: 1, spots: 8, gender: null })]);
  });
});
