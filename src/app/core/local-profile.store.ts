import { computed, inject, Injectable, signal } from '@angular/core';
import { LOCAL_STORE } from './ports/key-value-store.port';
import { LocalProfile, PROFILE_PROMPTED_KEY, shouldPromptProfile } from './profile';
import { StorageService } from './storage.service';

/**
 * Who runs the app on this device (name, photo, category, "enter as a player"), shared by the shell (top bar,
 * setup prefill, auto-join) and the profile dialog. It changes only when the profile is saved, so a reader never
 * sees a half-typed name. Persisted by `StorageService` under `setpoint.profile.v1`.
 */
@Injectable({ providedIn: 'root' })
export class LocalProfileStore {
  private readonly storage = inject(StorageService);
  private readonly local = inject(LOCAL_STORE);
  private readonly current = signal<LocalProfile>(this.storage.loadProfile());

  readonly profile = this.current.asReadonly();
  readonly firstName = computed(() => this.current().name.trim().split(/\s+/)[0] ?? '');

  update(patch: Partial<LocalProfile>): void {
    const next = { ...this.current(), ...patch };
    this.current.set(next);
    this.storage.saveProfile(next);
  }

  saveName(name: string): void {
    this.update({ name: name.trim() });
  }

  /**
   * True once, on the first visit with an empty profile: the welcome panel should open. Remembers that it was
   * offered, so it never comes back on this device.
   */
  takeWelcomePrompt(): boolean {
    let prompted = true;
    try {
      prompted = this.local.getItem(PROFILE_PROMPTED_KEY) === 'true';
    } catch {
      /* sem persistência: não insiste */
    }
    if (!shouldPromptProfile(this.current(), prompted)) return false;
    try {
      this.local.setItem(PROFILE_PROMPTED_KEY, 'true');
    } catch {
      /* aparece de novo na próxima visita */
    }
    return true;
  }
}
