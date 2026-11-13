import { describe, expect, it } from 'vitest';
import { match, round, tournamentState } from '../../testing/tournament-state';
import { qualificationEnabled, qualificationSupported } from './qualification';

const roundOne = round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1)]);
const projected = tournamentState({ qualificationStats: true, hostingMode: 'shared', tournamentMode: 'super' });

describe('qualification projection', () => {
  it('exists for a shared Super tournament that turned it on, before the finals', () => {
    expect(qualificationSupported(projected)).toBe(true);
    expect(qualificationSupported({ ...projected, qualificationStats: false })).toBe(false);
    expect(qualificationSupported({ ...projected, hostingMode: 'local' })).toBe(false);
    expect(qualificationSupported({ ...projected, tournamentMode: 'groups' })).toBe(false);
    expect(
      qualificationSupported({ ...projected, finals: { matches: [], complete: false, podiumPlayerIds: [] } }),
    ).toBe(false);
  });

  it('unlocks once a round is complete', () => {
    expect(qualificationEnabled(projected)).toBe(false);
    expect(qualificationEnabled({ ...projected, rounds: [roundOne] })).toBe(true);
    expect(qualificationEnabled({ ...projected, hostingMode: 'local', rounds: [roundOne] })).toBe(false);
  });
});
