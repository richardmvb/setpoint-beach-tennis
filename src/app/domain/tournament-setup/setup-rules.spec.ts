import { describe, expect, it } from 'vitest';
import { namedPlayers, tournamentState } from '../../testing/tournament-state';
import {
  availableCourts,
  availableGamesToWin,
  availableSizes,
  enrollment,
  newTournament,
  normalizeStoredTournament,
  requiredRounds,
  reviewKind,
  withCourts,
  withDoublesFormat,
  withEarlyFinals,
  withFinalsPairing,
  withGroupFormat,
  withGroupSize,
  withHostingMode,
  withMixedFinalFormat,
  withSize,
  withTournamentMode,
  withTrimmedName,
} from './setup-rules';

describe('setup rules', () => {
  it('starts from a Super 8 on this device', () => {
    expect(newTournament('2026-11-16T10:00:00.000Z')).toMatchObject({
      size: 8,
      courts: 2,
      tournamentMode: 'super',
      hostingMode: 'local',
      players: [],
      rounds: [],
      createdAt: '2026-11-16T10:00:00.000Z',
    });
  });

  it('lists the sizes, courts, games and rounds each format allows', () => {
    const super8 = tournamentState();
    expect(availableSizes(super8)).toEqual([8, 10, 12, 24]);
    expect(availableGamesToWin(super8)).toEqual([3, 4, 5, 6]);
    expect(availableCourts(super8)).toEqual([2]);
    expect(requiredRounds(super8)).toBe(7);
    expect(availableCourts(tournamentState({ size: 24, doublesFormat: 'mixed' }))).toEqual([6, 3]);
    expect(requiredRounds(tournamentState({ size: 24, courts: 3, doublesFormat: 'mixed' }))).toBe(24);
    expect(requiredRounds(tournamentState({ size: 24, courts: 6, doublesFormat: 'mixed' }))).toBe(12);
    expect(requiredRounds(tournamentState({ size: 24, courts: 3 }))).toBe(46);
    expect(requiredRounds(tournamentState({ size: 10 }))).toBe(10);
    expect(requiredRounds(tournamentState({ size: 12, courts: 2 }))).toBe(12);
    const groups = tournamentState({ tournamentMode: 'groups', size: 12, courts: 3 });
    expect(availableSizes(groups)).toEqual([8, 12, 20, 24]);
    expect(availableGamesToWin(groups)).toEqual([4, 5, 6]);
    expect(availableCourts(groups)).toEqual([3]);
    expect(requiredRounds(groups)).toBe(3);
    expect(requiredRounds({ ...groups, groupFormat: 'fixed' })).toBe(5);
  });

  it('changing the size re-derives courts, rounds and fixed pairs, and ignores an impossible size', () => {
    const next = withSize(tournamentState(), 12);
    expect(next).toMatchObject({ size: 12, courts: 2, roundCount: 12 });
    expect(withSize(tournamentState(), 9)).toEqual(tournamentState());
    const fixed = tournamentState({ tournamentMode: 'groups', groupFormat: 'fixed', players: namedPlayers(8) });
    expect(withSize(fixed, 12).fixedPairs).toEqual([]);
  });

  it('switching to groups keeps a valid size, resets an invalid one and normalizes the games', () => {
    const groups = withTournamentMode(tournamentState({ size: 10, gamesToWin: 3 }), 'groups');
    expect(groups).toMatchObject({ tournamentMode: 'groups', size: 8, courts: 2, gamesToWin: 4, roundCount: 3 });
    expect(withTournamentMode(tournamentState({ size: 12 }), 'groups').size).toBe(12);
  });

  it('courts outside the format are ignored, and leaving the early-finals format turns them off', () => {
    const early = tournamentState({ size: 24, doublesFormat: 'mixed', courts: 3, earlyFinalsEnabled: true });
    expect(withCourts(early, 5)).toBe(early);
    expect(withCourts(early, 6)).toMatchObject({ courts: 6, earlyFinalsEnabled: false, roundCount: 12 });
  });

  it('doubles format and group format re-derive courts and fixed pairs; a started tournament keeps its doubles', () => {
    const mixed = withDoublesFormat(tournamentState({ size: 24, courts: 6 }), 'mixed');
    expect(mixed).toMatchObject({ doublesFormat: 'mixed', courts: 6, roundCount: 12 });
    const started = tournamentState({
      rounds: [{ number: 1, matches: [], restingPlayerIds: [] }],
    });
    expect(withDoublesFormat(started, 'mixed')).toBe(started);
    const fixed = withGroupFormat(tournamentState({ tournamentMode: 'groups', players: namedPlayers(8) }), 'fixed');
    expect(fixed.fixedPairs).toEqual([
      ['p1', 'p2'],
      ['p3', 'p4'],
      ['p5', 'p6'],
      ['p7', 'p8'],
    ]);
    expect(fixed.roundCount).toBe(3);
  });

  it('hosting mode turns the athletes projection on for shared and off for local', () => {
    expect(withHostingMode(tournamentState(), 'shared')).toMatchObject({
      hostingMode: 'shared',
      qualificationStats: true,
    });
    expect(withHostingMode(tournamentState({ qualificationStats: false }), 'shared').qualificationStats).toBe(false);
    expect(withHostingMode(tournamentState({ qualificationStats: true }), 'local').qualificationStats).toBe(false);
  });

  it('early finals only exist for the Super 24 mixed on 3 courts', () => {
    const plain = tournamentState();
    expect(withEarlyFinals(plain, true)).toBe(plain);
    expect(withMixedFinalFormat(plain, 'direct')).toBe(plain);
    const early = tournamentState({ size: 24, courts: 3, doublesFormat: 'mixed' });
    expect(withEarlyFinals(early, true)).toMatchObject({ earlyFinalsEnabled: true, mixedFinalFormat: 'knockout' });
    expect(withMixedFinalFormat(early, 'direct').mixedFinalFormat).toBe('direct');
  });

  it('a blank name falls back to a default', () => {
    expect(withTrimmedName(tournamentState({ name: '   ' })).name).toBe('Meu torneio');
    expect(withTrimmedName(tournamentState({ name: ' Sábado ' })).name).toBe('Sábado');
  });

  it('describes the enrolment and the review for the screen', () => {
    expect(enrollment(tournamentState({ players: namedPlayers(3) }))).toEqual({ kind: 'open', missing: 5 });
    expect(enrollment(tournamentState({ hostingMode: 'shared' }))).toEqual({ kind: 'shared', missing: 8 });
    const mixed = tournamentState({
      doublesFormat: 'mixed',
      players: [...namedPlayers(2, 'male'), ...namedPlayers(1, 'female')],
    });
    expect(enrollment(mixed)).toEqual({ kind: 'mixed', missing: 5, men: 2, women: 1, half: 4 });
    expect(reviewKind(tournamentState())).toBe('super');
    expect(reviewKind(tournamentState({ tournamentMode: 'groups' }))).toBe('groups');
    expect(reviewKind(tournamentState({ tournamentMode: 'groups', groupFormat: 'fixed' }))).toBe('fixedPairs');
  });
});

describe('normalizeStoredTournament', () => {
  it('fills what an older version did not store, without changing the input', () => {
    const stored = tournamentState({ players: namedPlayers(8) });
    const before = JSON.stringify(stored);
    const state = normalizeStoredTournament(stored);
    expect(state).toMatchObject({
      tournamentMode: 'super',
      doublesFormat: 'open',
      hostingMode: 'local',
      groupFormat: 'rotating',
      groups: [],
      fixedPairs: [],
      finals: null,
      tieBreakDraws: [],
    });
    expect(state).not.toBe(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('keeps what is stored', () => {
    const state = normalizeStoredTournament(
      tournamentState({ tournamentMode: 'groups', doublesFormat: 'mixed', hostingMode: 'shared', size: 12, courts: 3 }),
    );
    expect(state).toMatchObject({ tournamentMode: 'groups', doublesFormat: 'mixed', hostingMode: 'shared' });
  });

  it('fits courts and rounds to the size while there is no schedule', () => {
    const state = normalizeStoredTournament(tournamentState({ size: 12, courts: 5, roundCount: 1 }));
    expect(state.courts).toBe(3);
    expect(state.roundCount).toBe(requiredRounds(state));
  });

  it('leaves courts and rounds of a tournament that has a schedule', () => {
    const round = { id: 'r1', number: 1, matches: [], resting: [] };
    const stored = tournamentState({ courts: 5, roundCount: 1, rounds: [round as never] });
    const state = normalizeStoredTournament(stored);
    expect(state.courts).toBe(5);
    expect(state.roundCount).toBe(1);
  });
});

describe('Grupos 20', () => {
  const groups = (extra = {}) => withTournamentMode(tournamentState({ size: 12, ...extra }), 'groups');

  it('offers 20 only for open rotating groups', () => {
    expect(availableSizes(groups())).toEqual([8, 12, 20, 24]);
    expect(availableSizes(withGroupFormat(groups(), 'fixed'))).toEqual([8, 12, 24]);
    expect(availableSizes(withDoublesFormat(groups(), 'mixed'))).toEqual([8, 12, 24]);
    expect(availableSizes(tournamentState())).toEqual([8, 10, 12, 24]);
  });

  it('5 groups of 4 by default: 5 courts and 3 rounds; 4 groups of 5: 4 courts and 5 rounds', () => {
    const twenty = withSize(groups(), 20);
    expect(twenty).toMatchObject({ size: 20, courts: 5, roundCount: 3 });
    const five = withGroupSize(twenty, 5);
    expect(five).toMatchObject({ groupSize: 5, courts: 4, roundCount: 5 });
    expect(withGroupSize(five, 4)).toMatchObject({ groupSize: 4, courts: 5, roundCount: 3 });
  });

  it('the group size and the pairing only exist in this format, and are cleared when it is left', () => {
    expect(withGroupSize(groups(), 5)).toEqual(groups());
    expect(withFinalsPairing(groups(), 'seededDraw')).toEqual(groups());
    const chosen = withFinalsPairing(withGroupSize(withSize(groups(), 20), 5), 'seededDraw');
    expect(chosen).toMatchObject({ groupSize: 5, finalsPairing: 'seededDraw' });
    const smaller = withSize(chosen, 12);
    expect(smaller.groupSize).toBeUndefined();
    expect(smaller.finalsPairing).toBeUndefined();
    const fixed = withGroupFormat(chosen, 'fixed');
    expect(fixed).toMatchObject({ size: 24, courts: 6 });
    expect(fixed.groupSize).toBeUndefined();
    const mixed = withDoublesFormat(chosen, 'mixed');
    expect(mixed.size).toBe(24);
    expect(mixed.finalsPairing).toBeUndefined();
    expect(withTournamentMode(chosen, 'super').size).toBe(24);
  });

  it('the group size is fixed once a schedule exists, and the pairing once the finals exist', () => {
    const base = withGroupSize(withSize(groups(), 20), 5);
    const drawn = { ...base, rounds: [{ number: 1, matches: [], restingPlayerIds: [] }] };
    expect(withGroupSize(drawn, 4)).toBe(drawn);
    expect(withFinalsPairing(drawn, 'seededDraw').finalsPairing).toBe('seededDraw');
    const finished = { ...drawn, finals: { matches: [], complete: false, podiumPlayerIds: [] } };
    expect(withFinalsPairing(finished, 'seededDraw')).toBe(finished);
  });

  it('fits the courts of a stored 20-player tournament without a schedule', () => {
    const stored = normalizeStoredTournament(
      tournamentState({ size: 20, courts: 3, tournamentMode: 'groups', groupSize: 5, groupFormat: 'rotating' }),
    );
    expect(stored).toMatchObject({ courts: 4, roundCount: 5 });
  });
});
