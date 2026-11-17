import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../testing/memory-storage';
import { LOCAL_STORE, SESSION_STORE } from './ports/key-value-store.port';
import { ThemeService } from './theme';

function setup(stored?: string) {
  const local = new MemoryStorage();
  if (stored) local.setItem('setpoint.theme.v1', stored);
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_STORE, useValue: local },
      { provide: SESSION_STORE, useValue: new MemoryStorage() },
    ],
  });
  return { local, theme: TestBed.inject(ThemeService) };
}

beforeEach(() => {
  TestBed.resetTestingModule();
  delete document.documentElement.dataset['theme'];
});
afterEach(() => delete document.documentElement.dataset['theme']);

describe('ThemeService', () => {
  it('starts with the remembered theme and puts it on the page when asked', () => {
    const { theme } = setup('dark');
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    theme.apply();
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('changes the theme, remembers it and applies it', () => {
    const { theme, local } = setup();
    theme.set('dark');
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(local.getItem('setpoint.theme.v1')).toBe('dark');
  });

  it('does nothing when the theme is already the one asked for', () => {
    const { theme, local } = setup('dark');
    theme.set('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(local.keys()).toEqual(['setpoint.theme.v1']);
  });
});
