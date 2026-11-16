import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CLOCK } from './ports/clock.port';
import { LOCAL_STORE, SESSION_STORE } from './ports/key-value-store.port';
import { FakeClock } from './ports/testing/clock.fake';
import { SavedTournaments } from './saved-tournaments';
import { MemoryStorage } from '../testing/memory-storage';
import { storedTournament } from '../testing/tournament-state';

function setup(local = new MemoryStorage()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_STORE, useValue: local },
      { provide: SESSION_STORE, useValue: new MemoryStorage() },
      { provide: CLOCK, useValue: new FakeClock() },
    ],
  });
  return { saved: TestBed.inject(SavedTournaments), local };
}

describe('SavedTournaments', () => {
  it('starts empty and lists what the library holds after a refresh', () => {
    const { saved } = setup();
    expect(saved.entries()).toEqual([]);
    saved.library.save({ ...storedTournament(), name: 'Sábado', analyticsId: 'a-1', hostingMode: 'local' });
    expect(saved.entries()).toEqual([]);
    saved.refresh();
    expect(saved.entries().map((entry) => entry.name)).toEqual(['Sábado']);
  });

  it('remove deletes the tournament and updates the list', () => {
    const { saved, local } = setup();
    saved.library.save({ ...storedTournament(), name: 'Sábado', analyticsId: 'a-1', hostingMode: 'local' });
    saved.refresh();
    saved.remove('a-1');
    expect(saved.entries()).toEqual([]);
    expect(local.getItem('setpoint.library.v1.state.a-1')).toBeNull();
  });

  it('shows an empty list when the stored library cannot be read', () => {
    const local = new MemoryStorage();
    local.setItem('setpoint.library.v1', '{"version":1,"entries":"broken"');
    const { saved } = setup(local);
    saved.refresh();
    expect(saved.entries()).toEqual([]);
  });
});
