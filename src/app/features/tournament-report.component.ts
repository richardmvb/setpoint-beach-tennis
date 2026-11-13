import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject, input } from '@angular/core';

import { TournamentState } from '../core/models';
import { AUTH } from '../core/ports/auth.port';
import { LOCAL_LIVE } from '../core/ports/tournaments.port';
import { TournamentReportService } from '../core/tournament-report.service';

@Component({
  selector: 'app-tournament-report',
  standalone: true,
  imports: [],
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
  template: `
    <article class="surface-card report-panel">
      <div>
        <span class="card-kicker">TORNEIO FINALIZADO</span>
        <h2>Relatório final</h2>
      </div>
      <div class="report-actions">
        <button class="button primary" type="button" (click)="generateImage()" [disabled]="imageLoading">
          {{ imageLoading ? 'Gerando imagem…' : 'Gerar imagem' }}
        </button>
        <button class="button secondary" type="button" (click)="shareText()">Compartilhar texto</button>
        <button class="button secondary" type="button" (click)="toggleText()">
          {{ textVisible ? 'Ocultar texto' : 'Ver texto' }}
        </button>
        <button
          class="button secondary"
          type="button"
          (click)="generateFinalLink()"
          [disabled]="linkLoading || !sharedConfigured()"
        >
          {{ linkLoading ? 'Gerando link…' : finalLink ? 'Copiar link final' : 'Gerar link final' }}
        </button>
      </div>
      @if (textVisible) {
        <div>
          <textarea class="report-text" aria-label="Texto do relatório final" readonly [value]="reportText"></textarea>
          <div class="report-actions">
            <button class="button secondary" type="button" (click)="copyText()">Copiar texto</button>
          </div>
        </div>
      }
      @if (imageUrl) {
        <div class="report-preview">
          <img [src]="imageUrl" alt="Prévia do relatório completo do torneio" />
        </div>
      }
      @if (imageUrl) {
        <div class="report-actions">
          <button class="button primary" type="button" (click)="shareImage()">Compartilhar imagem</button
          ><button class="button secondary" type="button" (click)="downloadImage()">Baixar imagem</button>
        </div>
      }
      @if (finalLink) {
        <div class="report-link">
          <input aria-label="Link para visualizar o resultado final" readonly [value]="finalLink" /><button
            class="button secondary"
            type="button"
            (click)="copyLink()"
          >
            Copiar link
          </button>
        </div>
      }
      @if (!sharedConfigured()) {
        <p class="report-message">Link final indisponível: publicação não configurada neste deploy.</p>
      }
      @if (message) {
        <p class="report-message" [class.error]="messageIsError" role="status">{{ message }}</p>
      }
    </article>
  `,
})
export class TournamentReportComponent implements OnInit, OnDestroy {
  private readonly report = inject(TournamentReportService);
  private readonly localLive = inject(LOCAL_LIVE);
  private readonly auth = inject(AUTH);
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
      this.finalLink = localStorage.getItem(this.linkKey()) ?? '';
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
        await navigator.share({ title: `Resultado · ${this.state().name}`, text: this.reportText });
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
      this.setMessage('Texto copiado. Cole no WhatsApp.');
    } catch {
      this.setMessage('Não foi possível copiar. Selecione o texto e copie manualmente.', true);
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
      this.setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a imagem.', true);
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
      await navigator.share({ title: `Resultado · ${this.state().name}`, files: [file] });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        this.setMessage('Não foi possível compartilhar. Baixe a imagem e envie pelo WhatsApp.', true);
    }
  }

  downloadImage(): void {
    if (!this.imageUrl) return;
    const anchor = document.createElement('a');
    anchor.href = this.imageUrl;
    anchor.download = 'setpoint-relatorio-final.png';
    anchor.click();
    this.setMessage('Imagem baixada.');
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
        const token = new URL(existingLiveUrl).searchParams.get('live');
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
          throw new Error('Conecte-se com a sessão do moderador para gerar o link final.');
        }
        const snapshot: TournamentState = {
          ...state,
          hostingMode: 'local',
          analyticsId: undefined,
          sharedTournamentId: undefined,
          sharedStatus: undefined,
        };
        const credentials = await this.localLive.createLocalLiveTournament(snapshot);
        const url = new URL(document.baseURI);
        url.search = '';
        url.hash = '';
        url.searchParams.set('live', credentials.readToken);
        this.finalLink = url.toString();
      }
      try {
        localStorage.setItem(this.linkKey(), this.finalLink);
      } catch {
        /* link remains available on screen */
      }
      await this.copyLink();
    } catch (error) {
      this.setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o link final.', true);
    } finally {
      this.linkLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  async copyLink(): Promise<void> {
    if (!this.finalLink) return;
    try {
      await navigator.clipboard.writeText(this.finalLink);
      this.setMessage('Link final copiado.');
    } catch {
      this.setMessage('Não foi possível copiar. Selecione o link e copie manualmente.', true);
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
