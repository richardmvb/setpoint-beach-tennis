import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { PlayerStanding, TournamentState } from '../../../core/models';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { type ShareCardLayout, ShareCardService } from '../../../core/share-card.service';
import { ShareResultsSession } from './share-results-session';

export interface ShareResultsDialogData {
  /** The finished tournament. */
  state: TournamentState;
  standings: PlayerStanding[];
  playerId: string;
}

/** Outcomes with a translated message; `text` carries a message from the image service as it is. */
type ShareMessage =
  { key: 'notAnImage' | 'tooLarge' | 'downloaded' | 'shared' | 'previewFailed' | 'shareFailed' } | { text: string };

/** Id of the dialog's title, which names it (aria-labelledby). */
export const SHARE_RESULTS_TITLE_ID = 'share-results-title';

/** Largest background photo accepted, in bytes. */
const MAX_BACKGROUND_BYTES = 8_000_000;

/**
 * Builds a player's results card for Instagram: pick a layout and an optional background photo, then share or
 * download it. Open it with `DialogService.open`; it closes on Back, Escape or a click outside. The look lives in
 * the global `.share-preview-*` rules (src/styles.css).
 */
@Component({
  selector: 'app-share-results-dialog',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('tournament')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'share-preview-modal' },
  templateUrl: './share-results-dialog.component.html',
})
export class ShareResultsDialogComponent {
  private readonly data = inject<ShareResultsDialogData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly shareCard = inject(ShareCardService);
  private readonly analytics = inject(ANALYTICS);
  private readonly transloco = inject(TranslocoService);
  protected readonly session = inject(ShareResultsSession);

  protected readonly titleId = SHARE_RESULTS_TITLE_ID;
  protected readonly layouts: ShareCardLayout[] = ['podium', 'editorial', 'scoreboard'];
  protected readonly loading = signal(true);
  protected readonly previewUrl = signal('');
  protected readonly image = signal<Blob | null>(null);
  protected readonly message = signal<ShareMessage | null>(null);

  constructor() {
    this.session.message.set('');
    inject(DestroyRef).onDestroy(() => {
      const url = this.previewUrl();
      if (url) URL.revokeObjectURL(url);
      this.session.message.set(this.messageText());
    });
    void this.refresh();
  }

  close(): void {
    this.ref.close();
  }

  async chooseLayout(layout: ShareCardLayout): Promise<void> {
    if (this.session.layout() === layout) return;
    this.session.layout.set(layout);
    this.analytics.capture('share_layout_changed', { layout });
    await this.refresh();
  }

  async selectBackground(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.message.set({ key: 'notAnImage' });
      return;
    }
    if (file.size > MAX_BACKGROUND_BYTES) {
      this.message.set({ key: 'tooLarge' });
      return;
    }
    this.session.setBackground(file);
    await this.refresh();
  }

  async clearBackground(): Promise<void> {
    this.session.setBackground(null);
    await this.refresh();
  }

  download(): void {
    const image = this.image();
    const player = this.player();
    if (!image || !player) return;
    this.shareCard.downloadImage(image, player.name);
    this.message.set({ key: 'downloaded' });
    this.trackShared('downloaded');
  }

  async share(): Promise<void> {
    const image = this.image();
    const player = this.player();
    if (!image || !player) return;
    try {
      const shared = await this.shareCard.shareImage(image, player.name, this.data.state.name);
      if (!shared) {
        this.download();
        return;
      }
      this.message.set({ key: 'shared' });
      this.trackShared('shared');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.message.set(error instanceof Error ? { text: error.message } : { key: 'shareFailed' });
    }
  }

  private async refresh(): Promise<void> {
    this.loading.set(true);
    this.message.set(null);
    this.image.set(null);
    const previous = this.previewUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.previewUrl.set('');
    try {
      const image = await this.shareCard.generatePlayerResultsImage(
        this.data.state,
        this.data.standings,
        this.data.playerId,
        { layout: this.session.layout(), backgroundImageUrl: this.session.background()?.url },
      );
      this.image.set(image);
      this.previewUrl.set(URL.createObjectURL(image));
    } catch (error) {
      this.message.set(error instanceof Error ? { text: error.message } : { key: 'previewFailed' });
    } finally {
      this.loading.set(false);
    }
  }

  private player() {
    return this.data.state.players.find((item) => item.id === this.data.playerId);
  }

  private trackShared(method: 'downloaded' | 'shared'): void {
    const state = this.data.state;
    this.analytics.capture('results_shared', {
      share_method: method,
      share_layout: this.session.layout(),
      has_custom_background: !!this.session.background(),
      tournament_mode: state.tournamentMode,
      doubles_format: state.doublesFormat ?? 'open',
      tournament_size: state.size,
    });
  }

  /** The current message as text, kept for the page after the dialog closes. */
  private messageText(): string {
    const message = this.message();
    if (!message) return '';
    if ('text' in message) return message.text;
    return this.transloco.translate(`shareResults.messages.${message.key}`, {}, 'tournament/pt-BR');
  }
}
