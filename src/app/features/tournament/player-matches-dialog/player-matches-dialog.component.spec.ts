import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { render, screen, within } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import type { TournamentState } from '../../../core/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { match, namedPlayers, round, tournamentState } from '../../../testing/tournament-state';
import { PLAYER_MATCHES_TITLE_ID, PlayerMatchesDialogComponent } from './player-matches-dialog.component';

/** Ana (p1) plays two rounds and two finals. Fabi (p6) was removed from the roster after playing round 2. */
const state: TournamentState = tournamentState({
  players: namedPlayers(5),
  rounds: [
    round(1, [match('a', ['p1', 'p2'], ['p3', 'p4'], 4, 1)]),
    round(2, [match('b', ['p3', 'p5'], ['p1', 'p6'], 4, 2)]),
    round(3, [match('c', ['p1', 'p3'], ['p2', 'p4'])]),
  ],
  finals: {
    matches: [
      match('final', ['p1', 'p2'], ['p3', 'p4'], 6, 6, {
        phase: 'final',
        finalKind: 'championship',
        livePoints: [],
        tieBreakA: 5,
        tieBreakB: 7,
      }),
      match('third', ['p1', 'p5'], ['p3', 'p4'], 6, 2, { phase: 'final', finalKind: 'third-place' }),
    ],
    complete: false,
    podiumPlayerIds: [],
  },
});

async function setup(playerId = 'p1') {
  const close = vi.fn();
  await render(PlayerMatchesDialogComponent, {
    imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      { provide: DIALOG_DATA, useValue: { state, playerId } },
      { provide: DialogRef, useValue: { close } },
    ],
  });
  return { close };
}

const rows = () => screen.getAllByRole('article');

describe('PlayerMatchesDialogComponent', () => {
  it('is titled by the player, with the group-stage count', async () => {
    await setup();
    const title = screen.getByRole('heading', { name: 'Ana' });
    expect(title.id).toBe(PLAYER_MATCHES_TITLE_ID);
    expect(screen.getByText('HISTÓRICO DO ATLETA')).toBeTruthy();
    // Two scored matches of three scheduled.
    expect(screen.getByText('2 de 3 jogos na classificatória')).toBeTruthy();
  });

  it('lists each round with partner, opponents, score and result from the player side', async () => {
    await setup();
    const [first, second, third] = rows();
    expect(within(first).getByText('Rodada 1')).toBeTruthy();
    expect(within(first).getByText('Com Bia')).toBeTruthy();
    expect(within(first).getByText('vs Caio + Duda')).toBeTruthy();
    expect(within(first).getByText('4–1 · Vitória').classList).toContain('positive');
    // Ana was on team B: the score is turned to her side. Her partner was removed from the roster.
    expect(within(second).getByText('Com Jogador removido')).toBeTruthy();
    expect(within(second).getByText('2–4 · Derrota').classList).toContain('negative');
    expect(within(third).getByText('Pendente')).toBeTruthy();
  });

  it('names the finals and shows a point-by-point tie-break', async () => {
    await setup();
    const [, , , final, third] = rows();
    expect(within(final).getByText('FINAL')).toBeTruthy();
    // The championship is undecided (no points yet), so it has a score but no result.
    expect(within(final).getByText('6–6 (TB 5–7)')).toBeTruthy();
    expect(within(third).getByText('DISPUTA DE 3º LUGAR')).toBeTruthy();
    expect(within(third).getByText('6–2 · Vitória')).toBeTruthy();
  });

  it('closes from its close button', async () => {
    const { close } = await setup();
    screen.getByRole('button', { name: 'Fechar' }).click();
    expect(close).toHaveBeenCalled();
  });
});
