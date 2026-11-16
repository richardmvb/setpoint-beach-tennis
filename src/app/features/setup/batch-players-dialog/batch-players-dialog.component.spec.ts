import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import setupPtBr from '../../../../../public/i18n/setup/pt-BR.json';
import { namedPlayers, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import type { TournamentState } from '../../../core/models';
import { BatchPlayersDialogComponent } from './batch-players-dialog.component';

async function open(state: TournamentState = tournamentState()) {
  const close = vi.fn();
  await render(BatchPlayersDialogComponent, {
    imports: [translocoTesting({ 'setup/pt-BR': setupPtBr })],
    providers: [
      { provide: DIALOG_DATA, useValue: { state } },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  return { close };
}

const list = () => screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Lista de participantes' });
const paste = async (text: string) => fireEvent.input(await list(), { target: { value: text } });
const preview = () => fireEvent.click(screen.getByRole('button', { name: 'Gerar prévia' }));
const retype = (input: HTMLElement, value: string) => fireEvent.input(input, { target: { value } });

describe('BatchPlayersDialogComponent', () => {
  it('puts the cursor in the list and says how many seats are taken', async () => {
    await open(tournamentState({ players: namedPlayers(3) }));
    const field = await list();
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(screen.getByText('3 de 8 vagas já preenchidas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar\s+participante\(s\)/ }).hasAttribute('disabled')).toBe(true);
  });

  it('previews the pasted list and adds it when it is valid', async () => {
    const { close } = await open();
    await paste('Ana\nBruno\nCarla');
    preview();
    expect(screen.getByText('3 na lista')).toBeTruthy();
    const confirm = screen.getByRole('button', { name: /Adicionar 3 participante/ });
    expect(confirm.hasAttribute('disabled')).toBe(false);
    fireEvent.click(confirm);
    expect(close).toHaveBeenCalledWith([
      { name: 'Ana', gender: '' },
      { name: 'Bruno', gender: '' },
      { name: 'Carla', gender: '' },
    ]);
  });

  it('shows what is wrong, and clears it as the names are fixed', async () => {
    const { close } = await open(tournamentState({ players: namedPlayers(1) }));
    await paste('Ana\nZé\nZé');
    preview();
    const names = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Nome do participante' });
    await waitFor(() => expect(names.map((input) => input.value)).toEqual(['Ana', 'Zé', 'Zé']));
    expect(screen.getAllByText('Nome duplicado.')).toHaveLength(2);
    const confirm = screen.getByRole('button', { name: /Adicionar 3 participante/ });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    retype(names[0], 'Ana Maria');
    retype(names[2], 'Zeca');
    expect(screen.queryByText('Nome duplicado.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar 3 participante/ }));
    expect(close).toHaveBeenCalledWith([
      { name: 'Ana Maria', gender: '' },
      { name: 'Zé', gender: '' },
      { name: 'Zeca', gender: '' },
    ]);
  });

  it('needs a category for each athlete in mixed doubles', async () => {
    const { close } = await open(tournamentState({ doublesFormat: 'mixed' }));
    await paste('Ana, F\nBruno');
    preview();
    expect(screen.getByText('Selecione a categoria.')).toBeTruthy();
    const groups = screen.getAllByRole('radiogroup');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(['Categoria de Ana', 'Categoria de Bruno']);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Masculino' })[1]);
    expect(screen.queryByText('Selecione a categoria.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar 2 participante/ }));
    expect(close).toHaveBeenCalledWith([
      { name: 'Ana', gender: 'female' },
      { name: 'Bruno', gender: 'male' },
    ]);
  });

  it('warns about the athletes that do not fit', async () => {
    await open(tournamentState({ players: namedPlayers(7) }));
    await paste('Zé\nZeca');
    preview();
    expect(screen.getByText('Sem vaga disponível.')).toBeTruthy();
  });

  it('closes with nothing from the × button', async () => {
    const { close } = await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    expect(close).toHaveBeenCalledWith();
  });
});
