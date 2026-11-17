import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SelectedRound } from './selected-round';

describe('SelectedRound', () => {
  const service = (): SelectedRound => TestBed.inject(SelectedRound);

  it('starts on the first round', () => {
    expect(service().index()).toBe(0);
  });

  it('selects a round inside the schedule', () => {
    const round = service();
    expect(round.select(3, 7)).toBe(true);
    expect(round.index()).toBe(3);
  });

  it('ignores an index outside the schedule', () => {
    const round = service();
    round.select(2, 7);
    expect(round.select(7, 7)).toBe(false);
    expect(round.select(-1, 7)).toBe(false);
    expect(round.select(1.5, 7)).toBe(false);
    expect(round.index()).toBe(2);
  });

  it('goes back to the first round on reset', () => {
    const round = service();
    round.select(5, 7);
    round.reset();
    expect(round.index()).toBe(0);
  });
});
