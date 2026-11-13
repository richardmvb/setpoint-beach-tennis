import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DialogService, matchesPhrase } from './dialog.service';

const dialogEl = () => document.querySelector<HTMLElement>('.ui-dialog');
const buttons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.ui-dialog .ui-dialog-actions button'));
const buttonNamed = (name: string) => buttons().find((button) => button.textContent?.trim() === name);

/** Lets Angular render the dialog and run the focus step that follows. */
async function settle(): Promise<void> {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}

describe('dialog service', () => {
  it('finalizar só é aceito quando a palavra é digitada, ignorando caixa e espaços', () => {
    expect(matchesPhrase('finalizar', 'finalizar')).toBe(true);
    expect(matchesPhrase('  Finalizar ', 'finalizar')).toBe(true);
    expect(matchesPhrase('FINALIZAR', 'finalizar')).toBe(true);
    expect(matchesPhrase('finaliza', 'finalizar')).toBe(false);
    expect(matchesPhrase('finalizar torneio', 'finalizar')).toBe(false);
    expect(matchesPhrase('', 'finalizar')).toBe(false);
  });

  it('nenhum confirm nativo restou no app', () => {
    // Read the sources directly: a native dialog call is a text pattern, not something to import.
    const adapters = readdirSync(join(process.cwd(), 'src/app/core/adapters/supabase'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => `core/adapters/supabase/${file}`);
    const ui = readdirSync(join(process.cwd(), 'src/app/ui/dialog'))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => `ui/dialog/${file}`);
    const files = ['app.component.ts', 'core/storage.service.ts', ...adapters, ...ui];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), 'src/app', file), 'utf8');
      expect(source, `${file} usa diálogo nativo`).not.toMatch(/(?<![\w.])(confirm|alert|prompt)\(/);
    }
  });
});

describe('confirmation dialogs', () => {
  let service: DialogService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    service = TestBed.inject(DialogService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('resolves true when Confirm is pressed, and removes the dialog', async () => {
    const result = service.confirm({ title: 'Excluir?' });
    await settle();
    buttonNamed('Confirmar')?.click();
    expect(await result).toBe(true);
    await settle();
    expect(dialogEl()).toBeNull();
  });

  it('resolves false when Cancel is pressed', async () => {
    const result = service.confirm({ title: 'Excluir?' });
    await settle();
    buttonNamed('Cancelar')?.click();
    expect(await result).toBe(false);
  });

  it('resolves false on Escape', async () => {
    const result = service.confirm({ title: 'Excluir?' });
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    expect(await result).toBe(false);
  });

  it('resolves false on a click outside the dialog', async () => {
    const result = service.confirm({ title: 'Excluir?' });
    await settle();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    expect(await result).toBe(false);
  });

  it('uses the given labels, with Cancel before Confirm', async () => {
    const result = service.confirm({ title: 'Remover?', confirmText: 'Remover placar', cancelText: 'Manter' });
    await settle();
    expect(buttons().map((button) => button.textContent?.trim())).toEqual(['Manter', 'Remover placar']);
    buttonNamed('Manter')?.click();
    await result;
  });

  it('tells a destructive confirmation apart: danger button and warning icon, with Cancel focused first', async () => {
    const result = service.confirm({ title: 'Excluir?', tone: 'danger', confirmText: 'Excluir' });
    await settle();
    expect(buttonNamed('Excluir')?.classList.contains('danger')).toBe(true);
    expect(document.querySelector('.ui-dialog-icon')?.textContent).toBe('!');
    expect(document.activeElement).toBe(buttonNamed('Cancelar'));
    buttonNamed('Cancelar')?.click();
    await result;
  });

  it('focuses Confirm first for a non-destructive confirmation', async () => {
    const result = service.confirm({ title: 'Continuar?', confirmText: 'Continuar' });
    await settle();
    expect(buttonNamed('Continuar')?.classList.contains('primary')).toBe(true);
    expect(document.querySelector('.ui-dialog-icon')?.textContent).toBe('?');
    expect(document.activeElement).toBe(buttonNamed('Continuar'));
    buttonNamed('Cancelar')?.click();
    await result;
  });

  it('is an alert dialog named by its title and described by its text', async () => {
    const result = service.confirm({ title: 'Excluir este torneio?', text: 'Isto não pode ser desfeito.' });
    await settle();
    const container = document.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(container).not.toBeNull();
    expect(container?.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(container?.getAttribute('aria-labelledby') ?? '');
    const text = document.getElementById(container?.getAttribute('aria-describedby') ?? '');
    expect(title?.textContent).toBe('Excluir este torneio?');
    expect(text?.textContent).toBe('Isto não pode ser desfeito.');
    buttonNamed('Cancelar')?.click();
    await result;
  });

  it('has no description when there is no text', async () => {
    const result = service.confirm({ title: 'Continuar?' });
    await settle();
    expect(document.querySelector('[role="alertdialog"]')?.hasAttribute('aria-describedby')).toBe(false);
    buttonNamed('Cancelar')?.click();
    await result;
  });

  it('shows text as plain text, never as HTML', async () => {
    const result = service.confirm({ title: '<b>Negrito</b>', text: '<img src=x onerror=alert(1)>' });
    await settle();
    expect(document.querySelector('.ui-dialog-title')?.textContent).toBe('<b>Negrito</b>');
    expect(document.querySelector('.ui-dialog b')).toBeNull();
    expect(document.querySelector('.ui-dialog img')).toBeNull();
    buttonNamed('Cancelar')?.click();
    await result;
  });

  describe('typed confirmation', () => {
    const input = () => document.querySelector<HTMLInputElement>('.ui-dialog-input')!;
    const type = (value: string) => {
      input().value = value;
      input().dispatchEvent(new Event('input', { bubbles: true }));
      TestBed.tick();
    };

    it('keeps Confirm disabled until the phrase is typed, ignoring case and spaces', async () => {
      const result = service.confirmTyped({
        title: 'Finalizar?',
        phrase: 'finalizar',
        confirmText: 'Finalizar torneio',
      });
      await settle();
      expect(document.activeElement).toBe(input());
      expect(buttonNamed('Finalizar torneio')?.disabled).toBe(true);

      type('finaliza');
      expect(buttonNamed('Finalizar torneio')?.disabled).toBe(true);

      type('  FINALIZAR ');
      expect(buttonNamed('Finalizar torneio')?.disabled).toBe(false);
      buttonNamed('Finalizar torneio')?.click();
      expect(await result).toBe(true);
    });

    it('asks for the exact phrase when Enter is pressed too early, and stays open', async () => {
      const result = service.confirmTyped({ title: 'Finalizar?', phrase: 'finalizar' });
      await settle();
      type('fin');
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      TestBed.tick();
      expect(document.querySelector('.ui-dialog-error')?.textContent).toContain('Digite exatamente “finalizar”.');
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(dialogEl()).not.toBeNull();

      type('finalizar');
      expect(document.querySelector('.ui-dialog-error')).toBeNull();
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(await result).toBe(true);
    });

    it('can still be cancelled', async () => {
      const result = service.confirmTyped({ title: 'Finalizar?', phrase: 'finalizar' });
      await settle();
      buttonNamed('Cancelar')?.click();
      expect(await result).toBe(false);
    });
  });
});
