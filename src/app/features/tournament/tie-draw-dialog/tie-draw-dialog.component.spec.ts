import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { fireEvent, screen } from '@testing-library/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { fixedPairs8State } from '../../../testing/groups20';
import { match, namedPlayers, round, storedTournament, tournamentState } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { tournamentFakes } from '../tournament.fakes';
import {
  SHUFFLE_SETTLE_MS,
  SHUFFLE_STEPS_MS,
  TIE_DRAW_TITLE_ID,
  TieDrawDialogComponent,
} from './tie-draw-dialog.component';

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

/**
 * p1 and p2 win (their own tie already drawn), p11 and p12 lose, and the eight others never played: eight tie for
 * the six places from the 3rd.
 */
function tiedAcrossTheCut(): TournamentState {
  return tournamentState({
    players: namedPlayers(12),
    rounds: [round(1, [match('m1', ['p1', 'p2'], ['p11', 'p12'], 4, 0)])],
    tieBreakDraws: [{ playerIds: ['p1', 'p2'], order: ['p1', 'p2'], createdAt: '2026-11-26T10:00:00.000Z' }],
  });
}

/** What `prefers-reduced-motion` answers: most tests ask for less motion, so the result shows at once. */
function reducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openWith(state: TournamentState, { reduce = true } = {}) {
  reducedMotion(reduce);
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
    expect(title.textContent).toBe('Empate do 1º ao 8º lugar');
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
    expect(title()).toBe('Empate do 1º ao 2º lugar');
    await click('Realizar sorteio');
    await click('Confirmar e sortear próximo empate');
    expect(close).not.toHaveBeenCalled();
    expect(title()).toBe('Empate do 3º ao 4º lugar');
    expect(screen.getByRole('button', { name: 'Realizar sorteio' })).toBeTruthy();
  });

  it('when the tie crosses the cut, orders only the places that go on and lists the rest as out', async () => {
    const { tournament, click } = await openWith(tiedAcrossTheCut());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Empate do 3º ao 10º lugar');
    expect(
      screen.getByText('8 empatados disputam 6 vagas. O sorteio decide quem fica com elas e em que ordem.'),
    ).toBeTruthy();
    await click('Realizar sorteio');
    const order = tournament.state().tieBreakDraws!.at(-1)!.order;
    const [placed, left] = screen.getAllByRole('list');
    const rows = (list: HTMLElement) => [...list.querySelectorAll('li')].map((row) => row.textContent?.trim());
    expect(rows(placed)).toHaveLength(6);
    expect(rows(placed)[0]).toMatch(/^3º/);
    expect(rows(placed).at(-1)).toMatch(/^8º/);
    // The two left out show no place, in name order.
    expect(screen.getByText('Ficam fora')).toBeTruthy();
    const names = Object.fromEntries(tournament.state().players.map((player) => [player.id, player.name]));
    const namesIn = (list: HTMLElement) =>
      [...list.querySelectorAll(':scope > li > span')].map((name) => name.textContent);
    expect(namesIn(left)).toEqual(
      order
        .slice(6)
        .map((id) => names[id])
        .sort((a, b) => a.localeCompare(b)),
    );
  });

  it('shuffles the list before showing the result, unless the person asked for less motion', async () => {
    vi.useFakeTimers();
    const { fixture } = await openWith(allTied(), { reduce: false });
    fireEvent.click(screen.getByRole('button', { name: 'Realizar sorteio' }));
    fixture.detectChanges();
    const busy = screen.getByRole<HTMLButtonElement>('button', { name: 'Sorteando…' });
    expect(busy.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Sorteando…');
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true');
    const total = SHUFFLE_STEPS_MS.reduce((sum, step) => sum + step, 0) + SHUFFLE_SETTLE_MS;
    for (let elapsed = 0; elapsed <= total; elapsed += 50) {
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();
    }
    expect(screen.getByRole('button', { name: 'Confirmar e gerar finais' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Sorteio concluído.');
    expect(screen.getAllByRole('listitem')[0].textContent).toMatch(/^\s*1º/);
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
    expect(title.textContent).toMatch(/^Empate de duplas /);
    expect(
      screen.getByText('As duplas ficaram iguais em tudo. Sorteie a ordem das duplas para gerar as finais.'),
    ).toBeTruthy();
    // Each competitor is a pair: "Ana + Bia", with both avatars.
    const participants = [...document.querySelectorAll('.tie-draw-list li')].map((item) =>
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
