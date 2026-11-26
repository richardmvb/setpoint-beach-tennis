import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { fireEvent, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { fixedPairs8State } from '../../../testing/groups20';
import { storedTournament } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { tournamentFakes } from '../tournament.fakes';
import { TIE_DRAW_TITLE_ID, TieDrawDialogComponent } from './tie-draw-dialog.component';

/** Every match ends 4 to 4, so the eight players tie and nothing the rules know can split them. */
function allTied(): TournamentState {
  const state = storedTournament();
  return {
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: 4 })),
    })),
  };
}

async function openWith(state: TournamentState) {
  const fakes = tournamentFakes();
  const close = vi.fn();
  const save = fakes.hooks.save;
  TestBed.configureTestingModule({
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr })],
    providers: [...fakes.providers, { provide: DialogRef, useValue: { close } }],
  });
  const tournament = TestBed.inject(CurrentTournament);
  tournament.set(state);
  // Created by hand, not through `render`: the tournament must be set before the dialog reads it.
  const fixture = TestBed.createComponent(TieDrawDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  /** Clicks a button, as the person would, and lets the dialog render what changed. */
  const click = async (name: string): Promise<void> => {
    fireEvent.click(await screen.findByRole('button', { name }));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { ...fakes, close, save, tournament, fixture, click };
}

describe('TieDrawDialogComponent', () => {
  it('is named by its title, which says the places that tie', async () => {
    await openWith(allTied());
    const title = await screen.findByRole('heading', { level: 2 });
    expect(title.id).toBe(TIE_DRAW_TITLE_ID);
    expect(title.textContent).toBe('Empate entre 1º e 2º e 3º e 4º e 5º e 6º e 7º e 8º');
    expect(screen.getByText('O confronto direto não resolveu. Sorteie a ordem para gerar as finais.')).toBeTruthy();
  });

  it('draws the order, stores it in the tournament and saves', async () => {
    const { tournament, save, click } = await openWith(allTied());
    await click('Realizar sorteio');
    expect(tournament.state().tieBreakDraws).toHaveLength(1);
    expect(tournament.state().tieBreakDraws?.[0].order).toHaveLength(8);
    expect(save).toHaveBeenCalledWith('Sorteio registrado; a classificação foi atualizada.');
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('confirms and closes with true once no tie is left', async () => {
    const { close, click } = await openWith(allTied());
    await click('Realizar sorteio');
    await click('Confirmar e gerar finais');
    expect(close).toHaveBeenCalledWith(true);
  });

  it('moves to the next tie when one is left after the draw', async () => {
    // Two separate ties among the finalists: 1st and 2nd, and 3rd and 4th.
    const state = storedTournament();
    const [a, b, c, d, e, f, g, h] = state.players.map((player) => player.id);
    const tied: TournamentState = {
      ...state,
      rounds: [
        {
          number: 1,
          restingPlayerIds: [],
          matches: [
            { id: 'm1', court: 1, teamA: [a, b], teamB: [e, f], scoreA: 4, scoreB: 0 },
            { id: 'm2', court: 2, teamA: [c, d], teamB: [g, h], scoreA: 4, scoreB: 3 },
          ],
        },
      ],
    };
    const { close, click } = await openWith(tied);
    const title = () => screen.getByRole('heading', { level: 2 }).textContent;
    expect(title()).toBe('Empate entre 1º e 2º');
    await click('Realizar sorteio');
    await click('Confirmar e sortear próximo empate');
    expect(close).not.toHaveBeenCalled();
    expect(title()).toBe('Empate entre 3º e 4º');
    expect(screen.getByRole('button', { name: 'Realizar sorteio' })).toBeTruthy();
  });

  it('cancels with false and keeps the draws that were made', async () => {
    const { close, tournament, click } = await openWith(allTied());
    await click('Realizar sorteio');
    await click('Cancelar');
    expect(close).toHaveBeenCalledWith(false);
    expect(tournament.state().tieBreakDraws).toHaveLength(1);
  });
});

describe('TieDrawDialogComponent: fixed pairs', () => {
  it('draws between pairs, named after both partners, and never between partners', async () => {
    // Every match ends 6-3 to side A: the pairs that won tie with each other, and so do the pairs that lost.
    const { tournament, click } = await openWith(fixedPairs8State(3).state);
    const title = await screen.findByRole('heading', { level: 2 });
    expect(title.textContent).toMatch(/^Empate entre as duplas em /);
    expect(
      screen.getByText('As duplas ficaram iguais em tudo. Sorteie a ordem das duplas para gerar as finais.'),
    ).toBeTruthy();
    // Each competitor is a pair: "Ana + Bia", with both avatars.
    const participants = [...document.querySelectorAll('.tie-draw-participants > span')].map((item) =>
      item.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(participants.length).toBeGreaterThan(1);
    expect(participants.every((text) => / \+ /.test(text ?? ''))).toBe(true);

    await click('Realizar sorteio');
    const stored = tournament.state().tieBreakDraws!;
    expect(stored).toHaveLength(1);
    // Stored with the first partner of each pair: p1, p3, p5 or p7 (never a second partner).
    expect(stored[0].playerIds.every((id) => ['p1', 'p3', 'p5', 'p7'].includes(id))).toBe(true);
    expect(screen.getAllByRole('listitem').length).toBe(stored[0].order.length);
  });
});
