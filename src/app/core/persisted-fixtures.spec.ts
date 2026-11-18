import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import storedState from '../../../tests/fixtures/persisted/tournament/v2.json';
import storedSnapshot from '../../../tests/fixtures/persisted/shared-snapshot/v2.json';
import { normalizeSharedState } from '../domain/tournament-view/shared-state';
import { usesGroupQualification } from '../domain/tournament-view/format';
import { parseSharedSnapshot } from '../shared/parsers/rpc-responses';
import { shellFakes } from '../testing/shell-fakes';
import { StorageService } from './storage.service';

describe('persisted Grupos 20 fixtures (v2)', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: shellFakes().providers }));

  it('the stored tournament is read by this release, with its bracket with byes', () => {
    const state = TestBed.inject(StorageService).parseTournament(JSON.stringify(storedState));
    expect(state).toMatchObject({ size: 20, groupSize: 5, finalsPairing: 'seededDraw' });
    expect(usesGroupQualification(state!)).toBe(true);
    expect(state!.groups).toHaveLength(4);
    expect(state!.rounds).toHaveLength(5);
    expect(state!.finals!.matches.map((match) => match.id)).toEqual([
      'final-qfb-1',
      'final-qfb-2',
      'final-sf-1',
      'final-sf-2',
      'final-championship',
      'final-third-place',
    ]);
  });

  it('the shared snapshot is parsed and normalized', () => {
    const snapshot = parseSharedSnapshot(structuredClone(storedSnapshot));
    expect(snapshot.capacity).toBe(20);
    expect(normalizeSharedState(snapshot)).toMatchObject({ size: 20, groupSize: 5, hostingMode: 'shared' });
  });
});
