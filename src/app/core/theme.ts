import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import type { ThemeMode } from './models';
import { StorageService } from './storage.service';

/** The colour theme: remembered on this device and applied to the page (`data-theme`). The profile panel changes it. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<ThemeMode>(this.storage.loadTheme());

  readonly mode = this.current.asReadonly();

  /** Puts the remembered theme on the page (the shell calls it once at start). */
  apply(): void {
    this.document.documentElement.dataset['theme'] = this.current();
  }

  set(mode: ThemeMode): void {
    if (this.current() === mode) return;
    this.current.set(mode);
    this.storage.saveTheme(mode);
    this.apply();
  }
}
