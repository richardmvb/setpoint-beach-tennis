import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { render, screen, within } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import type { TournamentState } from '../../../core/models';
import { translocoTesting } from '../../../testing/transloco-testing';
import { fixedPairsState, groups20State, strongerPairWins } from '../../../testing/groups20';
import { match, namedPlayers, round, tournamentState } from '../../../testing/tournament-state';
import { qualificationField } from '../../../domain/tournament-view/group-qualification';
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

async function setup(playerId = 'p1', tournament: TournamentState = state) {
  const close = vi.fn();
  await render(PlayerMatchesDialogComponent, {
    imports: [translocoTesting({ 'tournament/pt-BR': tournamentPtBr })],
    providers: [
      { provide: DIALOG_DATA, useValue: { state: tournament, playerId } },
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
    // Typed as 6-6 with the tie-break 5-7: shown as a set won in the tie-break. The test's winner rule leaves the
    // championship without a result, so only the score is shown.
    expect(within(final).getByText('6–7 (TB 5–7)')).toBeTruthy();
    expect(within(third).getByText('DISPUTA DE 3º LUGAR')).toBeTruthy();
    expect(within(third).getByText('6–2 · Vitória')).toBeTruthy();
  });

  it('closes from its close button', async () => {
    const { close } = await setup();
    screen.getByRole('button', { name: 'Fechar' }).click();
    expect(close).toHaveBeenCalled();
  });
});

/** p3 and p5 never met and tie on everything; the draw put Edu (p5) first. */
function drawnTie(createdAt: string): TournamentState {
  return tournamentState({
    players: namedPlayers(6),
    rounds: [
      round(1, [match('m1', ['p2', 'p3'], ['p1', 'p4'], 4, 3)], ['p5', 'p6']),
      round(2, [match('m2', ['p1', 'p5'], ['p4', 'p6'], 4, 3)], ['p2', 'p3']),
      round(3, [match('m3', ['p3', 'p5'], ['p2', 'p6'], 4, 3)], ['p1', 'p4']),
    ],
    tieBreakDraws: [{ playerIds: ['p3', 'p5'], order: ['p5', 'p3'], createdAt }],
  });
}

describe('PlayerMatchesDialogComponent, position', () => {
  it('shows the place, the numbers and why the player is behind and ahead of the neighbours', async () => {
    // Bia +3, Edu +2, Ana +1, Caio -1 all have one win; Duda none.
    await setup();
    expect(screen.getByRole('heading', { name: 'POSIÇÃO' })).toBeTruthy();
    expect(screen.getByText('3º no ranking geral')).toBeTruthy();
    expect(screen.getByText('Atrás de Edu (2º)')).toBeTruthy();
    expect(screen.getByText(/mesmas vitórias; desempate no saldo, \+2 × \+1/)).toBeTruthy();
    expect(screen.getByText('À frente de Caio (4º)')).toBeTruthy();
    expect(screen.getByText(/desempate no saldo, \+1 × -1/)).toBeTruthy();
  });

  it('opens the comparison with the deciding criterion marked', async () => {
    await setup();
    const toggle = screen.getByRole('button', { name: /Comparar com Edu/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await screen.findByRole('table', { name: 'Desempate entre Ana e Edu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const decided = screen.getByRole('rowheader', { name: /Saldo/ }).closest('tr')!;
    expect(decided.classList).toContain('decided');
    expect(within(decided).getByText('+1')).toBeTruthy();
    expect(within(decided).getByText('+2')).toBeTruthy();
    expect(screen.getAllByText('não foi preciso')).toHaveLength(3);
  });

  it('dates a recorded draw, and leaves out a time that does not parse', async () => {
    await setup('p5', drawnTie('2026-11-13T10:00:00.000Z'));
    expect(screen.getByText(/empate em tudo; decidido no sorteio de \d\d\/\d\d \d\d:\d\d/)).toBeTruthy();
  });

  it('says only that a draw was recorded when its time is unreadable', async () => {
    await setup('p5', drawnTie('not a date'));
    expect(screen.getByText(/empate em tudo; decidido no sorteio registrado/)).toBeTruthy();
  });

  it('in the 20-player format, shows the race to the final and the group status', async () => {
    const groups = groups20State(5, 3, strongerPairWins);
    const seed = qualificationField(groups).qualification.qualifiers[0];
    await setup(seed.playerId, groups);
    expect(screen.getByText('1º na corrida para a final')).toBeTruthy();
    expect(screen.getByText(/12 vagas na final/)).toBeTruthy();
    expect(screen.getByText(/Classificado/)).toBeTruthy();
    expect(screen.queryByText('provisório')).toBeNull();
  });

  it('fixed pairs: both partners get the place of the pair, with the pair as the neighbour', async () => {
    // The builder makes the pair with the highest player numbers the strongest: p11+p12 is first, p9+p10 second.
    const { state } = fixedPairsState(12, 3);
    await setup('p12', state);
    expect(screen.getByText('1ª dupla no ranking')).toBeTruthy();
    expect(screen.getByText(/4 vagas na final/)).toBeTruthy();
    expect(screen.getByText(/À frente de .+ \+ .+ \(2º\)/)).toBeTruthy();
  });

  it('fixed pairs: the partner sees the same place', async () => {
    const { state } = fixedPairsState(12, 3);
    await setup('p11', state);
    expect(screen.getByText('1ª dupla no ranking')).toBeTruthy();
  });
});
