import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { FinalsService } from '../../../core/finals.service';
import type { FinalStage, Match } from '../../../core/models';
import { finalsBracket } from '../../../domain/tournament-view/bracket';
import { namedPlayers } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { FinalsBracketComponent } from './finals-bracket.component';

const scrollTo = vi.fn();
beforeEach(() => {
  TestBed.resetTestingModule();
  scrollTo.mockClear();
  Element.prototype.scrollTo = scrollTo;
});

const finals = new FinalsService();
const players = namedPlayers(12);
const pairs: [string, string][] = Array.from({ length: 6 }, (_, i) => [`p${i * 2 + 1}`, `p${i * 2 + 2}`]);

function play(stage: FinalStage, id: string, scoreA: number, scoreB: number): FinalStage {
  const matches = stage.matches.map((m): Match => (m.id === id ? { ...m, scoreA, scoreB } : m));
  return finals.updatePodium({ ...stage, matches });
}

async function show(stage: FinalStage, highlightId = '') {
  const view = finalsBracket(stage, (match) => finals.winnerSide(match))!;
  await render(FinalsBracketComponent, {
    imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
    inputs: { view, players, highlightId },
  });
}

describe('FinalsBracketComponent', () => {
  it('shows the region, three stages, the byes, the seeds and the pending feeds', async () => {
    await show(finals.updatePodium(finals.createByeBracket(pairs)));
    const region = screen.getByRole('region', { name: 'Chave da fase final' });
    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
    ).toEqual(['Quartas', 'Semifinal', 'Final']);
    expect(within(region).getAllByText('BYE')).toHaveLength(2);
    // D1 shows twice: the bye node and the semifinal it waits in.
    expect(within(region).getAllByText('D1')).toHaveLength(2);
    expect(within(region).getByText('Vencedor QF2')).toBeTruthy();
    expect(within(region).getByText('Vencedor SF1')).toBeTruthy();
    expect(within(region).getByText('Perdedor SF2')).toBeTruthy();
    expect(within(region).getByRole('article', { name: 'DISPUTA DE 3º LUGAR' })).toBeTruthy();
    expect(screen.queryByText('AO VIVO')).toBeNull();
  });

  it('says who won, with the games, and marks the highlighted player', async () => {
    const stage = play(finals.updatePodium(finals.createByeBracket(pairs)), 'final-qfb-1', 6, 2);
    await show(stage, 'p7');
    const card = screen.getByRole('article', { name: 'Quartas 1' });
    expect(within(card).getAllByText('vencedora')).toHaveLength(1);
    expect(within(card).getByText('6')).toBeTruthy();
    expect(card.querySelector('.bracket-slot.me')?.textContent).toContain('Gui');
  });

  it('marks AO VIVO only on the championship scored point by point', async () => {
    let stage = finals.updatePodium(finals.createByeBracket(pairs));
    for (const id of ['final-qfb-1', 'final-qfb-2', 'final-sf-1', 'final-sf-2']) stage = play(stage, id, 6, 3);
    stage = {
      ...stage,
      matches: stage.matches.map((m) => (m.id === 'final-championship' ? { ...m, livePoints: ['A' as const] } : m)),
    };
    await show(stage);
    expect(screen.getAllByText('AO VIVO')).toHaveLength(1);
    expect(within(screen.getByRole('article', { name: 'FINAL' })).getByText('AO VIVO')).toBeTruthy();
  });

  it('a tab scrolls the track and is marked pressed', async () => {
    await show(finals.updatePodium(finals.createByeBracket(pairs)));
    const quartas = screen.getByRole('button', { name: 'Quartas', hidden: true });
    const final = screen.getByRole('button', { name: 'Final', hidden: true });
    expect(quartas.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(final);
    expect(final.getAttribute('aria-pressed')).toBe('true');
    expect(quartas.getAttribute('aria-pressed')).toBe('false');
    expect(scrollTo).toHaveBeenCalled();
  });
});
