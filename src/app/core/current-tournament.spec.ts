import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CLOCK } from './ports/clock.port';
import { FakeClock } from './ports/testing/clock.fake';
import { RANDOM } from './ports/random.port';
import { FakeRandom } from './ports/testing/random.fake';
import { CurrentTournament } from './current-tournament';
import { tournamentState } from '../testing/tournament-state';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      { provide: CLOCK, useValue: new FakeClock() },
      { provide: RANDOM, useValue: new FakeRandom() },
    ],
  });
  return TestBed.inject(CurrentTournament);
}

describe('CurrentTournament', () => {
  it('starts from an empty Super 8 and shows what was set', () => {
    const current = setup();
    expect(current.state()).toMatchObject({ size: 8, players: [] });
    const next = tournamentState({ name: 'Outro' });
    current.set(next);
    expect(current.state()).toBe(next);
  });

  it('update replaces the tournament with the returned one', () => {
    const current = setup();
    const before = current.state();
    current.update((state) => ({ ...state, name: 'Novo' }));
    expect(current.state()).not.toBe(before);
    expect(current.state().name).toBe('Novo');
    expect(before.name).not.toBe('Novo');
  });

  it('gives the tournament an analytics id once, as a new object', () => {
    const current = setup();
    const before = current.state();
    const id = current.ensureAnalyticsId();
    expect(id).not.toBe('');
    expect(current.state()).not.toBe(before);
    expect(current.state().analyticsId).toBe(id);
    const after = current.state();
    expect(current.ensureAnalyticsId()).toBe(id);
    expect(current.state()).toBe(after);
  });
});
