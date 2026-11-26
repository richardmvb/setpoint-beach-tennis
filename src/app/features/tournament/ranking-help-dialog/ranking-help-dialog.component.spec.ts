import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import type { TournamentState } from '../../../core/models';
import { fixedPairs8State, fixedPairsState, groups20State, groups24State } from '../../../testing/groups20';
import { storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { RANKING_HELP_TITLE_ID, RankingHelpDialogComponent } from './ranking-help-dialog.component';

async function setup(state: TournamentState) {
  const close = vi.fn();
  await render(RankingHelpDialogComponent, {
    imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      { provide: DIALOG_DATA, useValue: { state } },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  return { close };
}

const steps = () =>
  screen.getAllByRole('listitem').filter((item) => item.parentElement?.classList.contains('help-steps'));

describe('RankingHelpDialogComponent', () => {
  it('Grupos 20, 4 groups of 5: individual wins, the group order, 8 direct places plus all 4 thirds, the bracket', async () => {
    await setup(groups20State(5));
    expect(screen.getByRole('heading', { name: 'Como funciona o ranking' }).id).toBe(RANKING_HELP_TITLE_ID);
    expect(screen.getByText('20 atletas · 4 grupos de 5 · cada atleta joga 4 jogos')).toBeTruthy();
    expect(steps()).toHaveLength(4);
    expect(screen.getByText('Cada vitória é sua')).toBeTruthy();
    expect(screen.getByText('A ordem dentro do grupo')).toBeTruthy();
    expect(screen.getByText('Quem vai para a final: 12 vagas')).toBeTruthy();
    expect(screen.getByText(/Os 2 primeiros de cada grupo \(8\) e os 4 terceiros colocados/)).toBeTruthy();
    expect(screen.getByText(/Duplas cruzadas pelo ranking dos 12/)).toBeTruthy();
  });

  it('Grupos 20, 5 groups of 4 with the seeded draw: the 2 best of 5 thirds', async () => {
    await setup({ ...groups20State(4), finalsPairing: 'seededDraw' });
    expect(screen.getByText(/\(10\) e os 2 melhores entre os 5 terceiros colocados/)).toBeTruthy();
    expect(screen.getByText(/Cada uma das 6 melhores sorteia o parceiro/)).toBeTruthy();
  });

  it('24 in groups: the groups only organize the matches, the top 8 overall go to the final', async () => {
    await setup(groups24State());
    expect(screen.getByText('24 atletas · 6 grupos de 4 · cada atleta joga 3 jogos')).toBeTruthy();
    expect(screen.getByText('Os grupos só organizam os jogos')).toBeTruthy();
    expect(screen.getByText('Vale o ranking geral, com os 24 atletas numa lista só')).toBeTruthy();
    expect(screen.getByText('Os 8 primeiros vão para a final')).toBeTruthy();
    expect(screen.getByText(/Título: 1º e 3º contra 2º e 4º/)).toBeTruthy();
  });

  it('Super 8: everybody reaches the final, no group step', async () => {
    await setup(storedTournament());
    expect(screen.queryByText('Os grupos só organizam os jogos')).toBeNull();
    expect(screen.getByText('Os 8 vão para a final')).toBeTruthy();
  });

  it('fixed pairs: the pair adds up together, and the pairs stay together to the end', async () => {
    await setup(fixedPairs8State().state);
    expect(screen.getByText('A dupla soma junta')).toBeTruthy();
    expect(screen.getByText('Vale o ranking das duplas, com as 4 duplas numa lista só')).toBeTruthy();
    expect(screen.getByText('As 4 duplas vão para a final')).toBeTruthy();
    expect(screen.getByText(/Título: a 1ª dupla contra a 2ª\. Disputa de 3º lugar: a 3ª contra a 4ª\./)).toBeTruthy();
    expect(screen.queryByText(/Título: 1º e 3º/)).toBeNull();
  });

  it('fixed pairs of 12: only the best four pairs go on', async () => {
    await setup(fixedPairsState(12).state);
    expect(screen.getByText('As 4 melhores duplas vão para a final')).toBeTruthy();
    expect(screen.getByText('Vale o ranking das duplas, com as 6 duplas numa lista só')).toBeTruthy();
  });

  it('mixed early finals: one ranking per gender', async () => {
    await setup(tournamentState({ size: 24, courts: 3, doublesFormat: 'mixed', earlyFinalsEnabled: true }));
    expect(screen.getByText('Um ranking para cada gênero')).toBeTruthy();
    expect(screen.getByText('Os 8 melhores homens e as 8 melhores mulheres vão para a final.')).toBeTruthy();
  });

  it('closes from the close button and from Entendi', async () => {
    const { close } = await setup(groups20State(5));
    screen.getByRole('button', { name: 'Fechar' }).click();
    screen.getByRole('button', { name: 'Entendi' }).click();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
