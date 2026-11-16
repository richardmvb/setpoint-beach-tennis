import { DIALOG_DATA } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { LocalProfileStore } from '../../../core/local-profile.store';
import { PROFILE_KEY } from '../../../core/profile';
import { SavedTournaments } from '../../../core/saved-tournaments';
import { storedTournament } from '../../../testing/tournament-state';
import { profileFakes } from '../profile.fakes';
import { type ProfileDialogData, ProfilePanelStore, type ProfileShellState } from './profile-panel.store';

const shellState: ProfileShellState = { sync: 'synced', syncWarning: false, syncError: '', theme: 'light' };

function setup(options: { welcome?: boolean; profile?: object; saved?: number; theme?: 'light' | 'dark' } = {}) {
  const fakes = profileFakes({ buildVersion: 7 });
  if (options.profile) fakes.local.setItem(PROFILE_KEY, JSON.stringify(options.profile));
  const setTheme = vi.fn();
  const data: ProfileDialogData = {
    welcome: options.welcome ?? false,
    currentLibraryId: 'b',
    shell: signal({ ...shellState, theme: options.theme ?? 'light' }),
    setTheme,
  };
  TestBed.configureTestingModule({
    providers: [...fakes.providers, ProfilePanelStore, { provide: DIALOG_DATA, useValue: data }],
  });
  const saved = TestBed.inject(SavedTournaments);
  for (let i = 0; i < (options.saved ?? 0); i++) {
    fakes.clock.advance(1000);
    saved.library.save({ ...storedTournament(), name: `T${i}`, analyticsId: `id${i}`, hostingMode: 'local' });
  }
  const store = TestBed.inject(ProfilePanelStore);
  return { ...fakes, store, profileStore: TestBed.inject(LocalProfileStore), setTheme };
}

const events = (calls: { kind: string; event?: string }[]) =>
  calls.filter((call) => call.kind === 'capture').map((call) => call.event);

describe('ProfilePanelStore', () => {
  it('starts from the saved profile and the build version', () => {
    const { store } = setup({ profile: { name: 'Ana', autoJoin: false } });
    expect(store.name()).toBe('Ana');
    expect(store.profile().autoJoin).toBe(false);
    expect(store.versionLabel).toContain('7');
  });

  it('keeps the typed name as a draft until it is committed', () => {
    const { store, profileStore, local } = setup();
    store.setName('  Bia ');
    expect(store.hasName()).toBe(true);
    expect(profileStore.profile().name).toBe('');
    expect(local.getItem(PROFILE_KEY)).toBeNull();
    store.commitName();
    expect(profileStore.profile().name).toBe('Bia');
    expect(store.name()).toBe('Bia');
  });

  it('a blank draft is not a name', () => {
    const { store } = setup();
    store.setName('   ');
    expect(store.hasName()).toBe(false);
  });

  it('update saves a category and the auto-join choice', () => {
    const { store, local } = setup();
    store.update({ gender: 'male' });
    store.update({ autoJoin: false });
    expect(JSON.parse(local.getItem(PROFILE_KEY) ?? '{}')).toMatchObject({ gender: 'male', autoJoin: false });
  });

  it('shows the three most recent saved tournaments and marks the one in use', () => {
    const { store } = setup({ saved: 4 });
    expect(store.entries()).toHaveLength(4);
    expect(store.recent().map((entry) => entry.id)).toEqual(['id3', 'id2', 'id1']);
    expect(store.isCurrent('b')).toBe(true);
    expect(store.isCurrent('id3')).toBe(false);
  });

  it('opened as the profile panel it reports that, with whether a name and auto-join are set', () => {
    const { analytics } = setup({ profile: { name: 'Ana', autoJoin: false } });
    expect(analytics.calls).toEqual([
      { kind: 'capture', event: 'profile_opened', properties: { has_name: true, auto_join: false } },
    ]);
  });

  it('opened as the welcome panel it reports the welcome and, on close, what the organizer filled in', () => {
    const { store, analytics } = setup({ welcome: true });
    expect(events(analytics.calls)).toEqual(['profile_welcome_shown']);
    store.setName('Caio');
    store.update({ gender: 'male' });
    TestBed.resetTestingModule();
    expect(analytics.calls.at(-1)).toEqual({
      kind: 'capture',
      event: 'profile_welcome_closed',
      properties: { has_name: true, has_photo: false, has_gender: true, auto_join: true },
    });
  });

  it('closing the panel in any way saves the draft name', () => {
    const { store, local } = setup();
    store.setName('Duda');
    TestBed.resetTestingModule();
    expect((JSON.parse(local.getItem(PROFILE_KEY) ?? '{}') as { name?: string }).name).toBe('Duda');
    void store;
  });

  it('asks the shell to change the theme only when it differs', () => {
    const { store, setTheme } = setup({ theme: 'light' });
    store.setTheme('light');
    expect(setTheme).not.toHaveBeenCalled();
    store.setTheme('dark');
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
