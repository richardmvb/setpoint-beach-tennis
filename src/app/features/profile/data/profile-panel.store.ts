import { DIALOG_DATA } from '@angular/cdk/dialog';
import { computed, DestroyRef, inject, Injectable, type Signal, signal } from '@angular/core';
import type { ThemeMode } from '../../../core/models';
import { LocalProfileStore } from '../../../core/local-profile.store';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { APP_CONFIG, versionLabel } from '../../../core/ports/app-config.port';
import { PROFILE_NAME_MAX } from '../../../core/profile';
import { SavedTournaments } from '../../../core/saved-tournaments';
import type { SyncStatus } from '../../../core/state-machines';

/** What the shell knows that the panel shows: the sync state and the theme. */
export interface ProfileShellState {
  sync: SyncStatus;
  /** Something needs the organizer's attention (pending changes, an error, offline). */
  syncWarning: boolean;
  /** The text of the last sync error, when there is one. */
  syncError: string;
  theme: ThemeMode;
}

export interface ProfileDialogData {
  /** First visit: intro text, "Agora não" / "Salvar e continuar", no library or theme. */
  welcome: boolean;
  /** `libraryId` of the tournament in use, to mark it in the recent list. */
  currentLibraryId: string | null;
  /** The shell's state, kept up to date while the panel is open. */
  shell: Signal<ProfileShellState>;
  setTheme(mode: ThemeMode): void;
}

/** What the panel closes with when the organizer goes on to the saved tournaments. */
export type ProfileDialogResult = { kind: 'library' } | { kind: 'open'; id: string };

/**
 * The profile panel's state and actions. Provided by `ProfileDialogComponent`, so it lives and dies with the panel.
 * The name is a draft until it is saved (blur, Enter, or closing the panel in any way), so the top bar and the
 * stored profile never see a half-typed name.
 */
@Injectable()
export class ProfilePanelStore {
  private readonly data = inject<ProfileDialogData>(DIALOG_DATA);
  private readonly profileStore = inject(LocalProfileStore);
  private readonly saved = inject(SavedTournaments);
  private readonly analytics = inject(ANALYTICS);

  readonly welcome = this.data.welcome;
  readonly shell = this.data.shell;
  readonly nameMax = PROFILE_NAME_MAX;
  readonly versionLabel = versionLabel(inject(APP_CONFIG));
  readonly profile = this.profileStore.profile;
  readonly name = signal(this.profileStore.profile().name);
  readonly hasName = computed(() => !!this.name().trim());
  readonly entries = this.saved.entries;
  /** The three most recent saved tournaments. */
  readonly recent = computed(() => this.saved.entries().slice(0, 3));

  constructor() {
    this.saved.refresh();
    const { name, autoJoin } = this.profileStore.profile();
    if (this.welcome) this.analytics.capture('profile_welcome_shown');
    else this.analytics.capture('profile_opened', { has_name: !!name, auto_join: autoJoin });
    // Every way of closing (Escape, click outside, the buttons) ends here, before the shell hears the dialog closed.
    inject(DestroyRef).onDestroy(() => {
      this.commitName();
      if (!this.welcome) return;
      const profile = this.profileStore.profile();
      this.analytics.capture('profile_welcome_closed', {
        has_name: !!profile.name,
        has_photo: !!profile.photoDataUrl,
        has_gender: !!profile.gender,
        auto_join: profile.autoJoin,
      });
    });
  }

  isCurrent(id: string): boolean {
    return id === this.data.currentLibraryId;
  }

  setName(value: string): void {
    this.name.set(value);
  }

  /** Saves the draft (trimmed) as the profile's name. */
  commitName(): void {
    this.profileStore.saveName(this.name());
    this.name.set(this.profileStore.profile().name);
  }

  update(patch: Parameters<LocalProfileStore['update']>[0]): void {
    this.profileStore.update(patch);
  }

  setTheme(mode: ThemeMode): void {
    if (this.data.shell().theme !== mode) this.data.setTheme(mode);
  }
}
