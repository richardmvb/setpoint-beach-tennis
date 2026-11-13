import { Injectable, type OnDestroy, signal } from '@angular/core';
import type { ShareCardLayout } from '../../../core/share-card.service';

/**
 * What the share dialog keeps between openings: the chosen layout and background photo, and the last outcome
 * message, which the page also shows under its share button once the dialog closes.
 */
@Injectable({ providedIn: 'root' })
export class ShareResultsSession implements OnDestroy {
  readonly layout = signal<ShareCardLayout>('podium');
  /** An object URL of a photo on this device (never uploaded), with its file name. */
  readonly background = signal<{ url: string; name: string } | null>(null);
  readonly message = signal('');

  setBackground(file: File | null): void {
    const current = this.background();
    if (current) URL.revokeObjectURL(current.url);
    this.background.set(file ? { url: URL.createObjectURL(file), name: file.name } : null);
  }

  ngOnDestroy(): void {
    this.setBackground(null);
  }
}
