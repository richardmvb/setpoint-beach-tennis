import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject, input } from '@angular/core';

import { TournamentState } from '../../../core/models';
import { AUTH } from '../../../core/ports/auth.port';
import { LOCAL_STORE } from '../../../core/ports/key-value-store.port';
import { liveTokenOf } from '../../../core/routing/app-url';
import { URL_STATE } from '../../../core/routing/url-state';
import { LOCAL_LIVE } from '../../../core/ports/tournaments.port';
import { TournamentReportService } from '../../../core/tournament-report.service';
import { provideTranslocoScope, TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonComponent } from '@ui/button/button.component';
import { CardComponent } from '@ui/card/card.component';

@Component({
  selector: 'app-tournament-report',
  standalone: true,
  imports: [TranslocoDirective, ButtonComponent, CardComponent],
  providers: [provideTranslocoScope('organizer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        grid-column: 1/-1;
        min-width: 0;
      }
      .report-panel {
        display: grid;
        gap: 16px;
      }
      .report-panel h2 {
        margin: 5px 0 0;
      }
      .report-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .report-actions .button {
        min-height: 44px;
      }
      .report-preview {
        max-height: 360px;
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface-soft);
      }
      .report-preview img {
        display: block;
        width: min(100%, 600px);
        height: auto;
        margin: auto;
      }
      .report-text {
        width: 100%;
        min-height: 180px;
        resize: vertical;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font-family: inherit;
        font-size: 13px;
        line-height: 1.5;
      }
      .report-link {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .report-link input {
        flex: 1 1 260px;
        min-width: 0;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-size: 12px;
      }
      .report-message {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }
      .report-message.error {
        color: var(--danger);
      }
      @media (max-width: 600px) {
        .report-actions .button {
          flex: 1 1 150px;
        }
        .report-link .button {
          min-height: 44px;
        }
      }
    `,
  ],
  templateUrl: './tournament-report.component.html',
})
export class TournamentReportComponent implements OnInit, OnDestroy {
  private readonly report = inject(TournamentReportService);
  private readonly localLive = inject(LOCAL_LIVE);
  private readonly auth = inject(AUTH);
  private readonly store = inject(LOCAL_STORE);
  private readonly urlState = inject(URL_STATE);
  private readonly transloco = inject(TranslocoService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private alive = true;
  private image: Blob | null = null;

  readonly state = input.required<TournamentState>();
  readonly existingLiveUrl = input('');
  readonly sharedConfigured = input(false);
  imageLoading = false;
  linkLoading = false;
  imageUrl = '';
  reportText = '';
  textVisible = false;
  finalLink = '';
  message = '';
  messageIsError = false;

  ngOnInit(): void {
    try {
      this.finalLink = this.store.getItem(this.linkKey()) ?? '';
    } catch {
      this.finalLink = '';
    }
  }

  ngOnDestroy(): void {
    this.alive = false;
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
  }

  toggleText(): void {
    this.textVisible = !this.textVisible;
    if (this.textVisible) this.reportText = this.report.toText(this.report.build(this.state()));
  }

  async shareText(): Promise<void> {
    this.reportText = this.report.toText(this.report.build(this.state()));
    this.textVisible = true;
    this.message = '';
    try {
      if (navigator.share) {
        await navigator.share({
          title: this.transloco.translate('report.shareTitle', { name: this.state().name }, 'organizer/pt-BR'),
          text: this.reportText,
        });
        return;
      }
      await this.copyText();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      await this.copyText();
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  async copyText(): Promise<void> {
    this.reportText = this.report.toText(this.report.build(this.state()));
    this.textVisible = true;
    try {
      await navigator.clipboard.writeText(this.reportText);
      this.setMessage(this.transloco.translate('report.messages.textCopied', {}, 'organizer/pt-BR'));
    } catch {
      this.setMessage(this.transloco.translate('report.messages.textCopyFailed', {}, 'organizer/pt-BR'), true);
    }
  }

  async generateImage(): Promise<void> {
    if (this.imageLoading) return;
    this.imageLoading = true;
    this.message = '';
    try {
      const image = await this.report.toImage(this.report.build(this.state()));
      if (!this.alive) return;
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.image = image;
      this.imageUrl = URL.createObjectURL(image);
    } catch (error) {
      this.setMessage(
        error instanceof Error
          ? error.message
          : this.transloco.translate('report.messages.imageFailed', {}, 'organizer/pt-BR'),
        true,
      );
    } finally {
      this.imageLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  async shareImage(): Promise<void> {
    if (!this.image) return;
    const file = new File([this.image], 'setpoint-relatorio-final.png', { type: 'image/png' });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      this.downloadImage();
      return;
    }
    try {
      await navigator.share({
        title: this.transloco.translate('report.shareTitle', { name: this.state().name }, 'organizer/pt-BR'),
        files: [file],
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        this.setMessage(this.transloco.translate('report.messages.shareFailed', {}, 'organizer/pt-BR'), true);
    }
  }

  downloadImage(): void {
    if (!this.imageUrl) return;
    const anchor = document.createElement('a');
    anchor.href = this.imageUrl;
    anchor.download = 'setpoint-relatorio-final.png';
    anchor.click();
    this.setMessage(this.transloco.translate('report.messages.downloaded', {}, 'organizer/pt-BR'));
  }

  async generateFinalLink(): Promise<void> {
    const state = this.state();
    if (!state.finishedAt || this.linkLoading) return;
    if (this.finalLink) {
      await this.copyLink();
      return;
    }
    this.linkLoading = true;
    this.message = '';
    try {
      const existingLiveUrl = this.existingLiveUrl();
      if (existingLiveUrl) {
        const token = liveTokenOf(existingLiveUrl);
        if (token) {
          try {
            const existing = await this.localLive.getLocalLiveTournament(token);
            if (
              (existing.status === 'completed' || existing.status === 'archived') &&
              existing.state.finishedAt === state.finishedAt
            ) {
              this.finalLink = existingLiveUrl;
            }
          } catch {
            this.finalLink = '';
          }
        }
      }
      if (!this.finalLink) {
        if (state.hostingMode === 'shared' && !(await this.auth.currentUser())) {
          throw new Error(this.transloco.translate('report.messages.moderatorSession', {}, 'organizer/pt-BR'));
        }
        const snapshot: TournamentState = {
          ...state,
          hostingMode: 'local',
          analyticsId: undefined,
          sharedTournamentId: undefined,
          sharedStatus: undefined,
        };
        const credentials = await this.localLive.createLocalLiveTournament(snapshot);
        this.finalLink = this.urlState.baseLiveUrl(credentials.readToken);
      }
      try {
        this.store.setItem(this.linkKey(), this.finalLink);
      } catch {
        /* link remains available on screen */
      }
      await this.copyLink();
    } catch (error) {
      this.setMessage(
        error instanceof Error
          ? error.message
          : this.transloco.translate('report.messages.linkFailed', {}, 'organizer/pt-BR'),
        true,
      );
    } finally {
      this.linkLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  async copyLink(): Promise<void> {
    if (!this.finalLink) return;
    try {
      await navigator.clipboard.writeText(this.finalLink);
      this.setMessage(this.transloco.translate('report.messages.linkCopied', {}, 'organizer/pt-BR'));
    } catch {
      this.setMessage(this.transloco.translate('report.messages.linkCopyFailed', {}, 'organizer/pt-BR'), true);
    }
  }

  private linkKey(): string {
    const state = this.state();
    const id = state.sharedTournamentId || state.analyticsId || state.createdAt;
    return `setpoint.final-report.${id}.${this.state().finishedAt}`;
  }

  private setMessage(message: string, error = false): void {
    this.message = message;
    this.messageIsError = error;
    this.changeDetector.markForCheck();
  }
}
