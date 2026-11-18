import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tournamentState } from '../../testing/tournament-state';
import {
  availableCourts,
  availableGamesToWin,
  availableSizes,
  requiredRounds,
  withCourts,
  withDoublesFormat,
  withEarlyFinals,
  withFinalsPairing,
  withGroupFormat,
  withGroupSize,
  withSize,
  withTournamentMode,
} from './setup-rules';
import type { TournamentState } from '../../core/models';

type Step = (state: TournamentState) => TournamentState;

const steps: fc.Arbitrary<Step> = fc.oneof(
  fc.constantFrom(8, 10, 12, 20, 24, 9).map(
    (size): Step =>
      (s) =>
        withSize(s, size),
  ),
  fc.constantFrom(2, 3, 6, 5).map(
    (courts): Step =>
      (s) =>
        withCourts(s, courts),
  ),
  fc.constantFrom<'super' | 'groups'>('super', 'groups').map(
    (mode): Step =>
      (s) =>
        withTournamentMode(s, mode),
  ),
  fc.constantFrom<'open' | 'mixed'>('open', 'mixed').map(
    (format): Step =>
      (s) =>
        withDoublesFormat(s, format),
  ),
  fc.constantFrom<'fixed' | 'rotating'>('fixed', 'rotating').map(
    (format): Step =>
      (s) =>
        withGroupFormat(s, format),
  ),
  fc.constantFrom<4 | 5>(4, 5).map(
    (groupSize): Step =>
      (s) =>
        withGroupSize(s, groupSize),
  ),
  fc.constantFrom<'crossed' | 'seededDraw'>('crossed', 'seededDraw').map(
    (pairing): Step =>
      (s) =>
        withFinalsPairing(s, pairing),
  ),
  fc.boolean().map(
    (on): Step =>
      (s) =>
        withEarlyFinals(s, on),
  ),
);

describe('setup rules, in any order of choices', () => {
  it('always leave a size, courts, games and rounds that the format allows', () => {
    fc.assert(
      fc.property(fc.array(steps, { maxLength: 12 }), (sequence) => {
        const state = sequence.reduce((current, step) => step(current), tournamentState());
        expect(availableSizes(state)).toContain(state.size);
        expect(availableCourts(state)).toContain(state.courts);
        expect(availableGamesToWin(state)).toContain(state.gamesToWin);
        expect(state.roundCount).toBe(requiredRounds(state));
        if (state.size !== 20) {
          expect(state.groupSize).toBeUndefined();
          expect(state.finalsPairing).toBeUndefined();
        }
        if (state.earlyFinalsEnabled) expect(state.size === 24 && state.courts === 3).toBe(true);
      }),
    );
  });
});
