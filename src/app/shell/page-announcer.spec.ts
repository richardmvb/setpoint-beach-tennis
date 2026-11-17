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
  h1.className = 'x';
  const wrap = document.createElement('div');
  wrap.className = 'page-heading';
  wrap.append(h1);
  document.body.append(wrap);
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

  it('moves focus to the heading after the screen has rendered, and not when it is the same screen', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    announcer.announce('overview');
    TestBed.tick();
    expect(document.activeElement).not.toBe(h1);
    announcer.announce('rounds');
    expect(document.activeElement).not.toBe(h1);
    TestBed.tick();
    expect(document.activeElement).toBe(h1);
    expect(h1.tabIndex).toBe(-1);
    expect(document.title).toBe('Partidas · SETPOINT');
  });

  it('only sets the title when the app changed the screen itself', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    const focus = vi.spyOn(h1, 'focus');
    announcer.announce('setup', false);
    TestBed.tick();
    expect(focus).not.toHaveBeenCalled();
    expect(document.title).toBe('Novo torneio · SETPOINT');
  });

  it('waits for a heading that is still loading', async () => {
    const announcer = setup();
    announcer.announce('overview');
    announcer.announce('dashboard');
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const h1 = heading();
    await vi.waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('looks for the heading in the content or the shell heading, and ignores one that left the page', () => {
    const announcer = setup();
    announcer.announce('overview');
    const stray = document.createElement('h1');
    document.body.append(stray);
    announcer.announce('rounds');
    TestBed.tick();
    expect(document.activeElement).not.toBe(stray);
    const main = document.createElement('main');
    main.id = 'main-content';
    const h1 = document.createElement('h1');
    main.append(h1);
    document.body.append(main);
    announcer.announce('ranking');
    TestBed.tick();
    expect(document.activeElement).toBe(h1);
  });

  it('leaves focus alone while a dialog is open or a field is being typed in', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    announcer.announce('rounds');
    TestBed.tick();
    expect(document.activeElement).not.toBe(h1);
    dialog.remove();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    announcer.announce('ranking');
    TestBed.tick();
    expect(document.activeElement).toBe(input);
  });

  it('moves focus once, for the latest screen only, when several changes come quickly', () => {
    const announcer = setup();
    announcer.announce('overview');
    const h1 = heading();
    const focus = vi.spyOn(h1, 'focus');
    announcer.announce('rounds');
    announcer.announce('ranking');
    TestBed.tick();
    expect(focus).toHaveBeenCalledOnce();
    expect(document.title).toBe('Ranking · SETPOINT');
  });
});
