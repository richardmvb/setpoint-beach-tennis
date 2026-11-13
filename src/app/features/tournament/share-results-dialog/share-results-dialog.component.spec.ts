import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { ANALYTICS } from '../../../core/ports/analytics.port';
import { FakeAnalytics } from '../../../core/ports/testing/analytics.fake';
import { ShareCardService } from '../../../core/share-card.service';
import { translocoTesting } from '../../../testing/transloco-testing';
import { namedPlayers, tournamentState } from '../../../testing/tournament-state';
import { SHARE_RESULTS_TITLE_ID, ShareResultsDialogComponent } from './share-results-dialog.component';
import { ShareResultsSession } from './share-results-session';

const state = tournamentState({ name: 'Super de sábado', players: namedPlayers(4), doublesFormat: 'mixed' });

/** The image service draws on a canvas; here it returns a fixed image or fails on demand. */
class FakeShareCard {
  generate = vi.fn<(...args: unknown[]) => Promise<Blob>>(() => Promise.resolve(new Blob(['png'])));
  shareSupported = true;
  generatePlayerResultsImage(...args: unknown[]): Promise<Blob> {
    return this.generate(...args);
  }
  downloadImage = vi.fn();
  shareImage = vi.fn(() => Promise.resolve(this.shareSupported));
}

let urls = 0;
const revoked: string[] = [];

beforeEach(() => {
  urls = 0;
  revoked.length = 0;
  // jsdom has no object URLs.
  URL.createObjectURL = () => `blob:test/${++urls}`;
  URL.revokeObjectURL = (url: string) => void revoked.push(url);
});

afterEach(() => {
  TestBed.resetTestingModule();
});

async function setup() {
  const shareCard = new FakeShareCard();
  const analytics = new FakeAnalytics();
  analytics.start();
  const view = await render(ShareResultsDialogComponent, {
    imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      { provide: DIALOG_DATA, useValue: { state, standings: [], playerId: 'p2' } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: ShareCardService, useValue: shareCard },
      { provide: ANALYTICS, useValue: analytics },
    ],
  });
  const preview = await screen.findByRole('img', { name: 'Prévia do card de resultados' });
  return { view, shareCard, analytics, preview, session: TestBed.inject(ShareResultsSession) };
}

const events = (analytics: FakeAnalytics) =>
  analytics.calls.flatMap((call) => (call.kind === 'capture' ? [{ event: call.event, ...call.properties }] : []));

describe('ShareResultsDialogComponent', () => {
  it('builds the preview for the player when it opens', async () => {
    const { shareCard, preview } = await setup();
    expect(screen.getByRole('heading', { name: 'Personalize e confira' }).id).toBe(SHARE_RESULTS_TITLE_ID);
    expect(preview.getAttribute('src')).toBe('blob:test/1');
    expect(shareCard.generate).toHaveBeenCalledWith(state, [], 'p2', {
      layout: 'podium',
      backgroundImageUrl: undefined,
    });
    expect(screen.getByRole('button', { name: 'Pódio' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('rebuilds with another layout, frees the old preview and records the change', async () => {
    const { shareCard, analytics, view } = await setup();
    screen.getByRole('button', { name: 'Editorial' }).click();
    await view.fixture.whenStable();
    expect(await screen.findByRole('img', { name: 'Prévia do card de resultados' })).toBeTruthy();
    expect(shareCard.generate).toHaveBeenLastCalledWith(state, [], 'p2', {
      layout: 'editorial',
      backgroundImageUrl: undefined,
    });
    expect(revoked).toContain('blob:test/1');
    expect(screen.getByRole('button', { name: 'Editorial' }).getAttribute('aria-pressed')).toBe('true');
    expect(events(analytics)).toContainEqual({ event: 'share_layout_changed', layout: 'editorial' });
  });

  it('downloads the image and records how it was shared', async () => {
    const { shareCard, analytics } = await setup();
    screen.getByRole('button', { name: 'Baixar imagem' }).click();
    expect(shareCard.downloadImage).toHaveBeenCalledWith(expect.any(Blob), 'Bia');
    expect(await screen.findByText('Imagem baixada.')).toBeTruthy();
    expect(events(analytics)).toContainEqual({
      event: 'results_shared',
      share_method: 'downloaded',
      share_layout: 'podium',
      has_custom_background: false,
      tournament_mode: undefined,
      doubles_format: 'mixed',
      tournament_size: 8,
    });
  });

  it('downloads instead when the device cannot share files', async () => {
    const { shareCard } = await setup();
    shareCard.shareSupported = false;
    screen.getByRole('button', { name: 'Compartilhar' }).click();
    expect(await screen.findByText('Imagem baixada.')).toBeTruthy();
    expect(shareCard.downloadImage).toHaveBeenCalled();
  });

  it('refuses a file that is not an image, or one over 8 MB', async () => {
    const { view } = await setup();
    const input = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
    const choose = (file: File) => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    choose(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Escolha um arquivo de imagem.')).toBeTruthy();
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 8_000_001 });
    choose(big);
    expect(await screen.findByText('A imagem deve ter até 8 MB.')).toBeTruthy();
  });

  it('uses a chosen photo as background and keeps it for the next opening', async () => {
    const { view, shareCard, session } = await setup();
    const input = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'praia.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change'));
    await view.fixture.whenStable();
    expect(await screen.findByText('praia.jpg')).toBeTruthy();
    expect(shareCard.generate).toHaveBeenLastCalledWith(state, [], 'p2', {
      layout: 'podium',
      backgroundImageUrl: session.background()?.url,
    });
    expect(screen.getByText('Trocar foto')).toBeTruthy();
  });

  it('shows the image service error when the preview cannot be built', async () => {
    const shareCard = new FakeShareCard();
    shareCard.generate.mockRejectedValueOnce(new Error('Canvas indisponível.'));
    await render(ShareResultsDialogComponent, {
      imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
      providers: [
        { provide: DIALOG_DATA, useValue: { state, standings: [], playerId: 'p2' } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: ShareCardService, useValue: shareCard },
        { provide: ANALYTICS, useValue: new FakeAnalytics() },
      ],
    });
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Canvas indisponível.'),
    );
    expect(screen.getByText('Sua prévia aparecerá aqui.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Baixar imagem' })).toHaveProperty('disabled', true);
  });

  it('leaves the last message for the page and frees the preview when it closes', async () => {
    const { view, session } = await setup();
    screen.getByRole('button', { name: 'Baixar imagem' }).click();
    await screen.findByText('Imagem baixada.');
    view.fixture.destroy();
    expect(session.message()).toBe('Imagem baixada.');
    expect(revoked).toContain('blob:test/1');
  });
});
