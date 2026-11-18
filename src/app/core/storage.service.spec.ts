import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { shellFakes } from '../testing/shell-fakes';
import { tournamentState } from '../testing/tournament-state';
import { StorageService } from './storage.service';

beforeEach(() => {
  TestBed.configureTestingModule({ providers: shellFakes().providers });
});

function parse(state: object): unknown {
  return TestBed.inject(StorageService).parseTournament(JSON.stringify(state));
}

describe('stored tournament validation: Grupos 20', () => {
  const twenty = tournamentState({ size: 20, courts: 5, roundCount: 3, tournamentMode: 'groups' });

  it('accepts 20 athletes, groups of 4 or 5 and both pairings', () => {
    expect(parse(twenty)).toMatchObject({ size: 20 });
    expect(parse({ ...twenty, groupSize: 5, finalsPairing: 'seededDraw' })).toMatchObject({
      groupSize: 5,
      finalsPairing: 'seededDraw',
    });
    expect(parse({ ...twenty, groupSize: 4, finalsPairing: 'crossed' })).not.toBeNull();
  });

  it('still rejects other sizes and invalid choices', () => {
    expect(parse({ ...twenty, size: 9 })).toBeNull();
    expect(parse({ ...twenty, groupSize: 6 })).toBeNull();
    expect(parse({ ...twenty, finalsPairing: 'random' })).toBeNull();
  });
});
