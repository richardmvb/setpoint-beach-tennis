import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CLOCK } from './ports/clock.port';
import { FakeClock } from './ports/testing/clock.fake';
import { CurrentTournament } from './current-tournament';
import { tournamentState } from '../testing/tournament-state';

function setup() {
  TestBed.configureTestingModule({ providers: [{ provide: CLOCK, useValue: new FakeClock() }] });
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

  it('hands saving and messages to the shell, and does nothing before the shell connects', () => {
    const current = setup();
    expect(() => {
      current.save('x');
      current.notify('x');
      current.clearNotice();
    }).not.toThrow();
    const hooks = { save: vi.fn(), notify: vi.fn(), clearNotice: vi.fn() };
    current.connect(hooks);
    current.save('Salvo');
    current.notify('Erro', 'error');
    current.notify('Ok');
    current.clearNotice();
    expect(hooks.save).toHaveBeenCalledWith('Salvo');
    expect(hooks.notify.mock.calls).toEqual([
      ['Erro', 'error'],
      ['Ok', 'success'],
    ]);
    expect(hooks.clearNotice).toHaveBeenCalledOnce();
  });
});
