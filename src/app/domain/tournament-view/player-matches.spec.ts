import { describe, expect, it } from 'vitest';
import type { Match } from '../../core/models';
import { match, namedPlayers, round, tournamentState } from '../../testing/tournament-state';
import { playerMatches, scheduledGroupMatches } from './player-matches';

const winnerSide = (final: Match): 1 | 2 | null => (final.id === 'final' ? 2 : null);

const state = tournamentState({
  players: namedPlayers(6),
  rounds: [
    round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1)]),
    round(2, [match('b', ['p3', 'p5'], ['p1', 'p6'], 4, 2), match('c', ['p2', 'p4'], ['p5', 'p6'])]),
    round(3, [match('d', ['p6', 'p1'], ['p2', 'p3'])]),
  ],
  finals: {
    matches: [
      match('final', ['p1', 'p2'], ['p3', 'p4'], 6, 7, {
        phase: 'final',
        finalKind: 'championship',
        livePoints: [],
        tieBreakA: 5,
        tieBreakB: 7,
      }),
      match('third', ['p5', 'p6'], ['p1', 'p3'], null, null, { phase: 'final', finalKind: 'third-place' }),
    ],
    complete: false,
    podiumPlayerIds: [],
  },
});

describe('playerMatches', () => {
  it('lists the group rounds in order, then the finals, from the player side', () => {
    const matches = playerMatches(state, 'p1', winnerSide);
    expect(matches.map((m) => m.phase)).toEqual([
      { kind: 'round', number: 1 },
      { kind: 'round', number: 2 },
      { kind: 'round', number: 3 },
      { kind: 'final', finalKind: 'championship' },
      { kind: 'final', finalKind: 'third-place' },
    ]);
    expect(matches[0]).toMatchObject({
      partnerId: 'p2',
      opponentIds: ['p3', 'p4'],
      scoreFor: 4,
      scoreAgainst: 1,
      result: 'win',
    });
    // On team B in round 2: the scores are turned to Ana's side.
    expect(matches[1]).toMatchObject({
      partnerId: 'p6',
      opponentIds: ['p3', 'p5'],
      scoreFor: 2,
      scoreAgainst: 4,
      result: 'loss',
    });
    expect(matches[2]).toMatchObject({ partnerId: 'p6', scoreFor: null, scoreAgainst: null, result: null });
  });

  it('decides finals with the final rule and shows a point-by-point tie-break from the player side', () => {
    const [, , , final, third] = playerMatches(state, 'p1', winnerSide);
    expect(final).toMatchObject({ result: 'loss', tieBreak: { for: 5, against: 7 } });
    expect(third).toMatchObject({ result: null, tieBreak: null });
    const championship = playerMatches(state, 'p3', winnerSide).find(
      (m) => m.phase.kind === 'final' && m.phase.finalKind === 'championship',
    );
    expect(championship).toMatchObject({ result: 'win', tieBreak: { for: 7, against: 5 } });
  });

  it('is empty without a player', () => {
    expect(playerMatches(state, '', winnerSide)).toEqual([]);
  });
});

describe('scheduledGroupMatches', () => {
  it('counts group matches only', () => {
    expect(scheduledGroupMatches(state, 'p1')).toBe(3);
    expect(scheduledGroupMatches(state, 'p4')).toBe(2);
    expect(scheduledGroupMatches(state, 'nobody')).toBe(0);
  });
});
