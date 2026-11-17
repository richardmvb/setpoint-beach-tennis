import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translocoTesting } from '../testing/transloco-testing';
import { PageAnnouncer } from './page-announcer';

function setup() {
  TestBed.configureTestingModule({ imports: [translocoTesting()] });
  return TestBed.inject(PageAnnouncer);
}

const heading = (): HTMLElement => {
  const h1 = document.createElement('h1');
  h1.textContent = 'Título';
  document.body.append(h1);
  return h1;
};

beforeEach(() => TestBed.resetTestingModule());
afterEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('PageAnnouncer', () => {
  it('sets the document title of the screen, and only sets it (no focus) on the first announcement', () => {
    const h1 = heading();
    setup().announce('setup');
    expect(document.title).toBe('Novo torneio · SETPOINT');
    expect(document.activeElement).not.toBe(h1);
  });

  it('has a title for every screen', () => {
    const announcer = setup();
    const titles: string[] = [];
    for (const screen of [
      'lock',
      'landing',
      'dashboard',
      'shared',
      'setup',
      'overview',
      'players',
      'rounds',
      'ranking',
      'projection',
      'settings',
    ] as const) {
      announcer.announce(screen);
      titles.push(document.title);
    }
    expect(titles).toEqual([
      'Acesso restrito · SETPOINT',
      'SETPOINT · Beach Tennis',
      'Dashboard · SETPOINT',
      'Acompanhar torneio · SETPOINT',
      'Novo torneio · SETPOINT',
      'Visão geral · SETPOINT',
      'Jogadores · SETPOINT',
      'Partidas · SETPOINT',
      'Ranking · SETPOINT',
      'Projeção · SETPOINT',
      'Ajustes · SETPOINT',
    ]);
  });

  it('moves focus to the heading when the screen changes, and not when it is the same screen', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    announcer.announce('overview');
    expect(document.activeElement).not.toBe(h1);
    announcer.announce('rounds');
    expect(document.activeElement).toBe(h1);
    expect(h1.tabIndex).toBe(-1);
    expect(document.title).toBe('Partidas · SETPOINT');
  });

  it('waits for a heading that is still loading', async () => {
    const announcer = setup();
    announcer.announce('overview');
    announcer.announce('dashboard');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const h1 = heading();
    await vi.waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('leaves focus alone while a dialog is open or a field is being typed in', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    announcer.announce('rounds');
    expect(document.activeElement).not.toBe(h1);
    dialog.remove();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    announcer.announce('ranking');
    expect(document.activeElement).toBe(input);
  });

  it('does not move focus for a screen that is gone by the time its heading appears', async () => {
    const announcer = setup();
    announcer.announce('overview');
    announcer.announce('rounds');
    announcer.announce('ranking');
    const h1 = heading();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(document.activeElement).toBe(h1);
  });
});
