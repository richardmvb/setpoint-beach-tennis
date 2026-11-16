import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import profilePtBr from '../../../../public/i18n/profile/pt-BR.json';
import tournamentPtBr from '../../../../public/i18n/tournament/pt-BR.json';
import { PROFILE_KEY } from '../../core/profile';
import { SavedTournaments } from '../../core/saved-tournaments';
import type { SyncStatus } from '../../core/state-machines';
import { storedTournament } from '../../testing/tournament-state';
import { translocoTesting } from '../../testing/transloco-testing';
import type { ProfileShellState } from './data/profile-panel.store';
import { PROFILE_TITLE_ID, PROFILE_WELCOME_TEXT_ID, ProfileDialogComponent } from './profile-dialog.component';
import { profileFakes } from './profile.fakes';

interface Options {
  welcome?: boolean;
  profile?: object;
  saved?: string[];
  shell?: Partial<ProfileShellState>;
}

async function setup(options: Options = {}) {
  const fakes = profileFakes({ buildVersion: 5 });
  if (options.profile) fakes.local.setItem(PROFILE_KEY, JSON.stringify(options.profile));
  const close = vi.fn();
  const setTheme = vi.fn();
  const shell = signal<ProfileShellState>({
    sync: 'synced',
    syncWarning: false,
    syncError: '',
    theme: 'light',
    ...options.shell,
  });
  await render(ProfileDialogComponent, {
    imports: [translocoTesting({ 'profile/pt-BR': profilePtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      ...fakes.providers,
      {
        provide: DIALOG_DATA,
        useValue: { welcome: options.welcome ?? false, currentLibraryId: 'a', shell: shell.asReadonly(), setTheme },
      },
      { provide: DialogRef, useValue: { close } },
    ],
    configureTestBed: () => {
      const saved = TestBed.inject(SavedTournaments);
      for (const id of options.saved ?? []) {
        fakes.clock.advance(60_000);
        saved.library.save({ ...storedTournament(), name: `Torneio ${id}`, analyticsId: id, hostingMode: 'local' });
      }
    },
  });
  return { ...fakes, close, setTheme, shell };
}

const nameInput = () => screen.getByLabelText<HTMLInputElement>('Seu nome');
const stored = (local: { getItem(key: string): string | null }) =>
  JSON.parse(local.getItem(PROFILE_KEY) ?? '{}') as { name?: string; autoJoin?: boolean; gender?: string };

describe('ProfileDialogComponent', () => {
  it('asks who you are when the profile is empty, and names itself by that title', async () => {
    await setup();
    const title = screen.getByRole('heading', { name: 'Quem é você?' });
    expect(title.id).toBe(PROFILE_TITLE_ID);
    expect(screen.getByText('SEU PERFIL')).toBeTruthy();
    expect(
      screen.getByText('Nenhum torneio salvo ainda. Eles aparecem aqui assim que a tabela for gerada.'),
    ).toBeTruthy();
    expect(screen.getByText('Versão v5')).toBeTruthy();
  });

  it('shows the saved name, and the title and the auto-join switch follow what is typed', async () => {
    await setup({ profile: { name: 'Ana', autoJoin: true } });
    expect(nameInput().value).toBe('Ana');
    expect(screen.getByRole('heading', { name: 'Ana' })).toBeTruthy();
    fireEvent.input(nameInput(), { target: { value: '' } });
    expect(screen.getByRole('heading', { name: 'Quem é você?' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('switch').disabled).toBe(true);
    fireEvent.input(nameInput(), { target: { value: 'Bia' } });
    expect(screen.getByRole<HTMLInputElement>('switch').disabled).toBe(false);
  });

  it('saves the name on blur and on Enter, trimmed', async () => {
    const { local } = await setup();
    fireEvent.input(nameInput(), { target: { value: '  Caio ' } });
    expect(local.getItem(PROFILE_KEY)).toBeNull();
    fireEvent.blur(nameInput());
    expect(stored(local).name).toBe('Caio');
    fireEvent.input(nameInput(), { target: { value: 'Caio S' } });
    fireEvent.keyDown(nameInput(), { key: 'Enter' });
    expect(stored(local).name).toBe('Caio S');
  });

  it('saves the auto-join choice and describes it', async () => {
    const { local } = await setup({ profile: { name: 'Ana', autoJoin: true } });
    expect(screen.getByText('Você será adicionado automaticamente à lista.')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(stored(local).autoJoin).toBe(false);
    expect(screen.getByText('Você só vai organizar, sem jogar.')).toBeTruthy();
  });

  it('saves the category', async () => {
    const { local } = await setup();
    fireEvent.click(screen.getByRole('radio', { name: /Feminino/ }));
    expect(stored(local).gender).toBe('female');
  });

  it('lists the three latest saved tournaments with a link to all of them', async () => {
    const { close } = await setup({ saved: ['a', 'b', 'c', 'd'] });
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Torneio d');
    expect(items.map((item) => item.textContent).join()).not.toContain('Torneio a');
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos (4)' }));
    expect(close).toHaveBeenCalledWith({ kind: 'library' });
  });

  it('opens a recent tournament, and marks the one in use', async () => {
    const { close } = await setup({ saved: ['a', 'b'] });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[1].textContent).toContain('Em uso');
    expect(items[0].textContent).toContain('Em andamento');
    fireEvent.click(within(items[0]).getByRole('button'));
    expect(close).toHaveBeenCalledWith({ kind: 'open', id: 'b' });
  });

  it('chooses the theme, doing nothing for the one already on', async () => {
    const { setTheme } = await setup({ shell: { theme: 'dark' } });
    const light = screen.getByRole('radio', { name: 'Claro' });
    const dark = screen.getByRole('radio', { name: 'Escuro' });
    expect(dark.getAttribute('aria-checked')).toBe('true');
    expect(light.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(dark);
    expect(setTheme).not.toHaveBeenCalled();
    fireEvent.click(light);
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  const statuses: [SyncStatus, string][] = [
    ['device-only', 'Salvo neste dispositivo'],
    ['error', 'Sincronização pendente'],
    ['offline', 'Sem conexão'],
    ['paused', 'Modo offline'],
    ['syncing', 'Sincronizando'],
    ['pending', 'Aguardando sincronização'],
    ['synced', 'Sincronizado'],
  ];
  it.each(statuses)('says the sync is %s', async (sync, text) => {
    await setup({ shell: { sync } });
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('flags a sync problem and shows its text on hover', async () => {
    await setup({ shell: { sync: 'error', syncWarning: true, syncError: 'Falhou' } });
    const status = screen.getByText('Sincronização pendente');
    expect(status.classList.contains('sync-warning')).toBe(true);
    expect(status.getAttribute('title')).toBe('Falhou');
  });

  it('keeps the library and theme out of the first-visit welcome', async () => {
    const { close } = await setup({ welcome: true });
    expect(screen.getByText('BEM-VINDO AO SETPOINT')).toBeTruthy();
    expect(screen.getByText(/Conte quem você é/).id).toBe(PROFILE_WELCOME_TEXT_ID);
    expect(screen.queryByText('MEUS TORNEIOS')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Tema' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(close).toHaveBeenCalledWith();
  });

  it('the welcome button says "Salvar e continuar" once a name is typed', async () => {
    const { close } = await setup({ welcome: true });
    fireEvent.input(nameInput(), { target: { value: 'Edu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
    expect(close).toHaveBeenCalled();
  });
});
