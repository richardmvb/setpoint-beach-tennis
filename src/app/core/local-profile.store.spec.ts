import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LOCAL_STORE, SESSION_STORE } from './ports/key-value-store.port';
import { LocalProfileStore } from './local-profile.store';
import { PROFILE_KEY, PROFILE_PROMPTED_KEY } from './profile';
import { MemoryStorage } from '../testing/memory-storage';

function setup(local = new MemoryStorage()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_STORE, useValue: local },
      { provide: SESSION_STORE, useValue: new MemoryStorage() },
    ],
  });
  return { store: TestBed.inject(LocalProfileStore), local };
}

describe('LocalProfileStore', () => {
  it('loads the saved profile and derives the first name', () => {
    const local = new MemoryStorage();
    local.setItem(PROFILE_KEY, JSON.stringify({ name: '  Ana Souza ', autoJoin: false }));
    const { store } = setup(local);
    expect(store.profile()).toMatchObject({ name: 'Ana Souza', autoJoin: false });
    expect(store.firstName()).toBe('Ana');
  });

  it('starts with an empty profile and no first name', () => {
    const { store } = setup();
    expect(store.profile()).toEqual({ name: '', autoJoin: true });
    expect(store.firstName()).toBe('');
  });

  it('update merges a patch and persists it', () => {
    const { store, local } = setup();
    store.update({ gender: 'female' });
    store.update({ autoJoin: false });
    expect(store.profile()).toEqual({ name: '', gender: 'female', autoJoin: false });
    expect(JSON.parse(local.getItem(PROFILE_KEY) ?? '{}')).toMatchObject({ gender: 'female', autoJoin: false });
  });

  it('saveName trims the name before saving', () => {
    const { store, local } = setup();
    store.saveName('  Bia  ');
    expect(store.profile().name).toBe('Bia');
    expect(JSON.parse(local.getItem(PROFILE_KEY) ?? '{}')).toMatchObject({ name: 'Bia' });
  });

  describe('takeWelcomePrompt', () => {
    it('is true once while the profile is empty, then never again', () => {
      const { store, local } = setup();
      expect(store.takeWelcomePrompt()).toBe(true);
      expect(local.getItem(PROFILE_PROMPTED_KEY)).toBe('true');
      expect(store.takeWelcomePrompt()).toBe(false);
    });

    it('is false when the profile already has a name', () => {
      const { store, local } = setup();
      store.saveName('Ana');
      expect(store.takeWelcomePrompt()).toBe(false);
      expect(local.getItem(PROFILE_PROMPTED_KEY)).toBeNull();
    });

    it('does not insist when storage cannot be read', () => {
      const local = new MemoryStorage();
      const { store } = setup(local);
      local.getItem = (): never => {
        throw new Error('blocked');
      };
      expect(store.takeWelcomePrompt()).toBe(false);
    });
  });
});
