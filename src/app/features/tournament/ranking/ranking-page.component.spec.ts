import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import organizerPtBr from '../../../../../public/i18n/organizer/pt-BR.json';
import tournamentPtBr from '../../../../../public/i18n/tournament/pt-BR.json';
import { CurrentTournament } from '../../../core/current-tournament';
import type { TournamentState } from '../../../core/models';
import { FinalsService } from '../../../core/finals.service';
import { withTieDraw } from '../../../domain/tournament-play/tie-draw';
import { rankingBoard } from '../../../domain/tournament-view/ranking-board';
import { createStandingsMemo } from '../../../domain/tournament-view/standings';
import {
  fixedPairsState,
  groups12State,
  groups20State,
  groups24State,
  groups8State,
  mixedGroups24State,
  sideAWins,
  strongerPairWins,
} from '../../../testing/groups20';
import { storedTournament } from '../../../testing/tournament-state';
import { translocoTesting } from '../../../testing/transloco-testing';
import { TournamentStore, type ShellRequest } from '../data/tournament.store';
import { tournamentFakes } from '../tournament.fakes';
import { RankingPageComponent } from './ranking-page.component';

beforeEach(() => TestBed.resetTestingModule());

function played(): TournamentState {
  const state = storedTournament();
  let index = 0;
  return {
    ...state,
    rounds: state.rounds.map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({ ...match, scoreA: 4, scoreB: index++ % 4 })),
    })),
  };
}

/** The finals of the played tournament, with the given scores on the championship and the third-place match. */
function withFinals(champion: [number, number] | null, third: [number, number] | null): TournamentState {
  const state = played();
  const finals = new FinalsService();
  const stage = finals.create(createStandingsMemo()(state).all);
  const [champ, thirdPlace] = stage.matches;
  if (champion) Object.assign(champ, { scoreA: champion[0], scoreB: champion[1] });
  if (third) Object.assign(thirdPlace, { scoreA: third[0], scoreB: third[1] });
  return { ...state, finals: finals.updatePodium(stage) };
}

async function show(state: TournamentState, stored: Record<string, string> = {}) {
  const fakes = tournamentFakes();
  for (const [key, value] of Object.entries(stored)) fakes.local.setItem(key, value);
  const hooks = fakes.hooks;
  const requests: ShellRequest[] = [];
  const { container } = await render(RankingPageComponent, {
    imports: [translocoTesting({ 'organizer/pt-BR': organizerPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: [...fakes.providers, TournamentStore],
    configureTestBed: () => {
      const tournament = TestBed.inject(CurrentTournament);
      tournament.set(state);
      TestBed.inject(TournamentStore).requests.subscribe((request) => requests.push(request));
    },
  });
  return { ...fakes, hooks, requests, container, tournament: TestBed.inject(CurrentTournament) };
}

describe('RankingPageComponent', () => {
  it('shows the individual ranking under the tie-break order, all five criteria', async () => {
    await show(played());
    expect(screen.getByRole('heading', { name: 'Ranking individual' })).toBeTruthy();
    const criteria = screen.getByRole('list', { name: 'DESEMPATE' });
    expect(
      within(criteria)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['1Vitórias', '2Saldo', '3Games pró', '4Confronto', '5Sorteio']);
  });

  it('opens "Como funciona" from the criteria strip', async () => {
    await show(played());
    const store = TestBed.inject(TournamentStore);
    const open = vi.spyOn(store, 'openRankingHelp').mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: /Como funciona/ }));
    expect(open).toHaveBeenCalled();
  });

  it('every row opens the athlete, and the hint above the ranking goes after the first tap', async () => {
    const { local } = await show(played());
    const store = TestBed.inject(TournamentStore);
    const open = vi.spyOn(store, 'openPlayerMatches').mockResolvedValue();
    expect(screen.getByText(/Toque num atleta para ver os jogos e a posição/)).toBeTruthy();
    const rows = screen.getAllByRole('button', { description: 'Abre os jogos e a posição do atleta' });
    expect(rows).toHaveLength(8);
    fireEvent.click(rows[0]);
    expect(open).toHaveBeenCalledWith(store.standings()[0].playerId);
    expect(screen.queryByText(/Toque num atleta para ver os jogos e a posição/)).toBeNull();
    expect(local.getItem('setpoint.ranking.hint')).toBe('1');
  });

  it('offers the finals once every match is played, and generates them', async () => {
    const { tournament, hooks } = await show(played());
    expect(screen.getByRole('heading', { name: 'Oito classificados' })).toBeTruthy();
    expect(screen.getByText('1º+3º × 2º+4º decidem o título; 5º+7º × 6º+8º, o 3º lugar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar finais' }));
    await vi.waitFor(() => expect(tournament.state().finals).toBeTruthy());
    expect(hooks.save).toHaveBeenCalledWith('Finais geradas com base nos oito primeiros do ranking.');
    expect(await screen.findByRole('heading', { name: 'Finais' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gerar finais' })).toBeNull();
  });

  it('does not offer the finals while a match is open', async () => {
    await show(storedTournament());
    expect(screen.queryByRole('button', { name: 'Gerar finais' })).toBeNull();
  });

  it('shows each final with its kind and status, and scores one by typing the games', async () => {
    const { tournament } = await show(withFinals(null, null));
    expect(screen.getByText('FINAL')).toBeTruthy();
    expect(screen.getByText('DISPUTA DE 3º LUGAR')).toBeTruthy();
    expect(screen.getAllByText('○ Pendente')).toHaveLength(2);
    const [champA, champB] = screen.getAllByRole<HTMLInputElement>('spinbutton', { name: /na final/ });
    fireEvent.input(champA, { target: { value: '6' } });
    fireEvent.input(champB, { target: { value: '2' } });
    expect(tournament.state().finals?.matches[0]).toMatchObject({ scoreA: 6, scoreB: 2 });
    expect(await screen.findByText('● Registrado')).toBeTruthy();
    expect(screen.getByText('Resultado salvo')).toBeTruthy();
  });

  it('shows the tie-break fields at 6 to 6', async () => {
    await show(withFinals([6, 6], null));
    expect(screen.getByText('Tie-break')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Pontos de tie-break da dupla 1' })).toBeTruthy();
    expect(screen.getByText('Tie-break: vencer por 2 pontos')).toBeTruthy();
  });

  it('switches the championship to point by point', async () => {
    const { tournament } = await show(withFinals(null, null));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar ponto a ponto' }));
    await vi.waitFor(() => expect(tournament.state().finals?.matches[0].livePoints).toEqual([]));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar ponto à dupla 1' }));
    expect(tournament.state().finals?.matches[0].livePoints).toEqual(['A']);
    expect(screen.getByText('PONTO A PONTO')).toBeTruthy();
  });

  it('shows the podium, the athlete picker and the finish button once the finals are complete', async () => {
    await show(withFinals([6, 2], [6, 4]));
    expect(screen.getByText('PÓDIO FINAL')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Chave da fase final' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Finalizar torneio' })).toBeTruthy();
    const picker = screen.getByRole('radiogroup', { name: 'Atleta para gerar a imagem' });
    expect(within(picker).getAllByRole('radio')).toHaveLength(8);
    const make = screen.getByRole<HTMLButtonElement>('button', { name: 'Selecione um atleta' });
    expect(make.disabled).toBe(true);
    fireEvent.click(within(picker).getAllByRole('radio')[0]);
    expect(await screen.findByRole('button', { name: /^Gerar imagem de / })).toBeTruthy();
  });

  it('finishing the tournament asks the shell to react', async () => {
    const { requests, tournament } = await show(withFinals([6, 2], [6, 4]));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar torneio' }));
    await vi.waitFor(() => expect(tournament.state().finishedAt).toBeTruthy());
    expect(requests).toContainEqual({ kind: 'finalized' });
    expect(await screen.findByText(/Duração do torneio:/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finalizar torneio' })).toBeNull();
  });
});

describe('RankingPageComponent: the 20-player format', () => {
  it('shows the groups and the race to the final: the marks, the cut line after 12, and the finals worded for the pairing', async () => {
    await show({ ...groups20State(4, 3, strongerPairWins), finalsPairing: 'seededDraw' });
    const groups = screen.getByRole('region', { name: 'Grupos' });
    expect(within(groups).getAllByRole('article')).toHaveLength(5);
    // The marks appear once every group match has a score, with their legend.
    expect(within(groups).getAllByText('Classificado')).toHaveLength(10);
    expect(within(groups).getAllByText('Melhor 3º')).toHaveLength(2);
    expect(within(groups).getAllByText('Eliminado')).toHaveLength(8);
    expect(within(groups).getByText(/Classificado ·.*Melhor 3º ·.*Eliminado/)).toBeTruthy();
    expect(within(groups).queryByText('provisório')).toBeNull();

    const race = screen.getByRole('article', { name: 'Corrida para a final' });
    expect(within(race).getByText('FASE FINAL · 12 VAGAS')).toBeTruthy();
    // Header, the 12 that go on, the cut line and the first one out.
    expect(within(race).getAllByRole('row')).toHaveLength(15);
    expect(within(race).getByText('LINHA DE CORTE · 12 VAGAS')).toBeTruthy();
    expect(within(race).getByText('Ordem final da fase de grupos. A semente 1 é a melhor.')).toBeTruthy();
    expect(screen.getByText('Doze classificados')).toBeTruthy();
    expect(screen.getByText(/Cada uma das 6 melhores sorteia o parceiro/)).toBeTruthy();
    // The old tables are gone for this format.
    expect(screen.queryByRole('heading', { name: 'Ranking individual' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Classificados' })).toBeNull();
  });

  it('is provisional, with no marks, while a group match has no score', async () => {
    await show(groups20State(4, 3));
    const groups = screen.getByRole('region', { name: 'Grupos' });
    expect(within(groups).getByText('provisório')).toBeTruthy();
    expect(within(groups).queryByText('Eliminado')).toBeNull();
    expect(within(groups).queryByText('Melhor 3º')).toBeNull();
    expect(screen.getByText('Ordem provisória: muda a cada placar até o fim da fase de grupos.')).toBeTruthy();
  });

  it('opens an athlete from a group card and from the list, and the hint goes after the first tap', async () => {
    const { local } = await show(groups20State(4, 3, strongerPairWins));
    const store = TestBed.inject(TournamentStore);
    const open = vi.spyOn(store, 'openPlayerMatches').mockResolvedValue();
    expect(screen.getByText(/Toque num atleta para ver os jogos e a posição/)).toBeTruthy();
    const groups = screen.getByRole('region', { name: 'Grupos' });
    const cards = within(groups).getAllByRole('button', { description: 'Abre os jogos e a posição do atleta' });
    expect(cards).toHaveLength(20);
    fireEvent.click(cards[0]);
    expect(open).toHaveBeenLastCalledWith(store.board()!.groups[0].entries[0].playerId);
    expect(screen.queryByText(/Toque num atleta para ver os jogos e a posição/)).toBeNull();
    expect(local.getItem('setpoint.ranking.hint')).toBe('1');

    const race = screen.getByRole('article', { name: 'Corrida para a final' });
    const rows = within(race).getAllByRole('button', { description: 'Abre os jogos e a posição do atleta' });
    expect(rows).toHaveLength(13);
    fireEvent.click(rows[2]);
    expect(open).toHaveBeenLastCalledWith(store.board()!.list[2].playerId);
  });

  it("opens a group's table in place from the header of its card", async () => {
    await show(groups20State(5, 3, strongerPairWins));
    const toggle = screen.getByRole('button', { name: 'Ver a tabela do Grupo B' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const table = screen.getByRole('table', { name: 'Tabela do Grupo B' });
    // Header and the five athletes of the group, with wins, balance and matches played.
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent?.trim()),
    ).toContain('JOGOS');
    fireEvent.click(toggle);
    expect(screen.queryByRole('table', { name: 'Tabela do Grupo B' })).toBeNull();
  });

  it('folds the athletes after the first one out behind "Ver todos"', async () => {
    await show(groups20State(4, 3, strongerPairWins));
    const race = screen.getByRole('article', { name: 'Corrida para a final' });
    const showAll = within(race).getByRole('button', { name: 'Ver todos (20)' });
    expect(showAll.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(showAll);
    // Header, 20 athletes and the cut line.
    expect(within(race).getAllByRole('row')).toHaveLength(22);
    fireEvent.click(within(race).getByRole('button', { name: 'Mostrar só até a linha de corte' }));
    expect(within(race).getAllByRole('row')).toHaveLength(15);
  });

  it('puts the finals first once they exist, and folds the groups into one row when the stage is over', async () => {
    const finals = new FinalsService();
    const state = groups20State(5, 3, strongerPairWins);
    const pairs = Array.from({ length: 6 }, (_, i): [string, string] => [
      state.players[i * 2].id,
      state.players[i * 2 + 1].id,
    ]);
    const { container } = await show({ ...state, finals: finals.updatePodium(finals.createByeBracket(pairs)) });
    const folded = container.querySelector('details')!;
    expect(folded.open).toBe(false);
    expect(within(folded).getByText('Fase de grupos encerrada')).toBeTruthy();
    expect(within(folded).getByText(/12 na final · .+ foi o 1º/)).toBeTruthy();
    const finalsCard = screen.getByRole('heading', { name: 'Finais' });
    expect(finalsCard.compareDocumentPosition(folded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the groups open under the finals when a group score was cleared', async () => {
    const finals = new FinalsService();
    const state = groups20State(5, 3, strongerPairWins);
    const pairs = Array.from({ length: 6 }, (_, i): [string, string] => [
      state.players[i * 2].id,
      state.players[i * 2 + 1].id,
    ]);
    const cleared = structuredClone(state);
    cleared.rounds[0].matches[0].scoreA = null;
    cleared.rounds[0].matches[0].scoreB = null;
    const { container } = await show({ ...cleared, finals: finals.updatePodium(finals.createByeBracket(pairs)) });
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('region', { name: 'Grupos' })).toBeTruthy();
  });

  it('draws the bye bracket when the organizer switches to Chave, and the score fields back under Jogos', async () => {
    const finals = new FinalsService();
    const state = groups20State(5, 3, strongerPairWins);
    const pairs = Array.from({ length: 6 }, (_, i): [string, string] => [
      state.players[i * 2].id,
      state.players[i * 2 + 1].id,
    ]);
    const { local } = await show({ ...state, finals: finals.updatePodium(finals.createByeBracket(pairs)) });
    // The score list is the default: that is where the organizer types.
    expect(screen.queryByRole('region', { name: 'Chave da fase final' })).toBeNull();
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Jogos' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Chave' }));
    expect(screen.getByRole('region', { name: 'Chave da fase final' })).toBeTruthy();
    expect(screen.getAllByText('BYE')).toHaveLength(2);
    expect(screen.getByRole('article', { name: 'Quartas 1' })).toBeTruthy();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(local.getItem('setpoint.finals.view')).toBe('bracket');

    fireEvent.click(screen.getByRole('button', { name: 'Jogos' }));
    expect(screen.queryByRole('region', { name: 'Chave da fase final' })).toBeNull();
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0);
  });

  it('opens on the view the organizer chose last time on this device', async () => {
    const finals = new FinalsService();
    const state = groups20State(5, 3, strongerPairWins);
    const pairs = Array.from({ length: 6 }, (_, i): [string, string] => [
      state.players[i * 2].id,
      state.players[i * 2 + 1].id,
    ]);
    await show(
      { ...state, finals: finals.updatePodium(finals.createByeBracket(pairs)) },
      { 'setpoint.finals.view': 'bracket' },
    );
    expect(screen.getByRole('region', { name: 'Chave da fase final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chave' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('RankingPageComponent: 24 players in groups', () => {
  it('ranks everybody in one list: the groups show the overall place and the top 8 go to the final', async () => {
    await show(groups24State(2, strongerPairWins));
    const groups = screen.getByRole('region', { name: 'Grupos' });
    expect(within(groups).getAllByRole('article')).toHaveLength(6);
    expect(within(groups).getByText('lugar no ranking geral')).toBeTruthy();
    // No group marks: the groups only organize the matches.
    expect(within(groups).queryByText('Classificado')).toBeNull();
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    expect(within(race).getByText('RANKING GERAL · 8 VAGAS NA FINAL')).toBeTruthy();
    // Header, the 8 that go on, the cut line and the first one out.
    expect(within(race).getAllByRole('row')).toHaveLength(11);
    expect(within(race).getByText('LINHA DE CORTE · 8 VAGAS')).toBeTruthy();
    expect(within(race).getByRole('button', { name: 'Ver todos (24)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Oito classificados' })).toBeTruthy();
  });
});

describe('RankingPageComponent: the Resumo view', () => {
  it('opens on Compacto for the organizer, and Resumo is one tap away, remembered on this device', async () => {
    const { local, container } = await show(groups20State(4, 3, strongerPairWins));
    expect(screen.getByRole('button', { name: 'Compacto' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('heading', { name: 'Quem vai para a final' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }));
    expect(screen.getByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resumo' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('article', { name: 'Corrida para a final' })).toBeNull();
    expect(local.getItem('setpoint.ranking.view.host')).toBe('summary');
    expect(container.querySelector('app-ranking-summary')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Compacto' }));
    expect(screen.getByRole('article', { name: 'Corrida para a final' })).toBeTruthy();
    expect(local.getItem('setpoint.ranking.view.host')).toBe('compact');
  });

  it('opens on the view this device chose last time', async () => {
    await show(groups20State(4, 3, strongerPairWins), { 'setpoint.ranking.view.host': 'summary' });
    expect(screen.getByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resumo' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('falls back to the default for a stored value it does not know', async () => {
    await show(groups20State(4, 3, strongerPairWins), { 'setpoint.ranking.view.host': 'wide' });
    expect(screen.getByRole('button', { name: 'Compacto' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('counts who goes on, with the progress of the group stage, and has no line about the organizer', async () => {
    const open = groups20State(4, 3, strongerPairWins);
    open.rounds[0].matches[0].scoreA = null;
    open.rounds[0].matches[0].scoreB = null;
    await show(open, { 'setpoint.ranking.view.host': 'summary' });
    const counts = (label: RegExp): string =>
      screen.getByText(label).closest('.count')!.textContent.replace(/\s+/g, ' ');
    // 5 groups of 4: the top two of each, and the 2 best third places.
    expect(counts(/passam direto/)).toContain('10');
    expect(counts(/melhores 3º/)).toContain('2');
    expect(counts(/ficam de fora/)).toContain('8');
    expect(screen.getByText('14 de 15 jogos')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Jogos da fase de grupos' }).getAttribute('aria-valuenow')).toBe(
      '14',
    );
    expect(screen.getByText('provisório')).toBeTruthy();
    expect(screen.queryByText(/Você:/)).toBeNull();
  });

  it('shows the groups as folding rows, with the first group open and who goes on in a line', async () => {
    const { container } = await show(groups20State(4, 3, strongerPairWins), {
      'setpoint.ranking.view.host': 'summary',
    });
    const rows = [...container.querySelectorAll<HTMLDetailsElement>('details.group-row')];
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.open)).toEqual([true, false, false, false, false]);
    // A closed row names the three that can go on, with wins and the mark of the finished group stage.
    expect(within(rows[1]).getByText('Grupo B')).toBeTruthy();
    expect(rows[1].querySelector('summary')!.textContent).toMatch(/Classificado/);
    expect(rows[1].querySelector('summary')!.textContent).toMatch(/\d+V/);
    // The open one holds its table, and the table opens the athlete.
    const table = within(rows[0]).getByRole('table', { name: 'Tabela do Grupo A' });
    const store = TestBed.inject(TournamentStore);
    const open = vi.spyOn(store, 'openPlayerMatches').mockResolvedValue();
    fireEvent.click(within(table).getAllByRole('button')[0]);
    expect(open).toHaveBeenCalledWith(store.board()!.groups[0].entries[0].playerId);
  });

  it('keeps the two lists folded: the race to the final and the individual ranking, informative only', async () => {
    const { container } = await show(groups20State(4, 3, strongerPairWins), {
      'setpoint.ranking.view.host': 'summary',
    });
    const folds = [...container.querySelectorAll<HTMLDetailsElement>('details.fold')];
    expect(folds.map((fold) => fold.open)).toEqual([false, false]);
    expect(within(folds[0]).getByText('Ordem dos 12 classificados')).toBeTruthy();
    expect(within(folds[1]).getByText('Ranking individual (20 atletas)')).toBeTruthy();
    expect(within(folds[1]).getByText('só informativo neste formato')).toBeTruthy();
    // The race list has its cut line; the individual list has none.
    expect(within(folds[0]).getByRole('table', { name: 'Corrida para a final' })).toBeTruthy();
    expect(within(folds[0]).getByText('LINHA DE CORTE · 12 VAGAS')).toBeTruthy();
    expect(within(folds[1]).queryByText(/LINHA DE CORTE/)).toBeNull();
    expect(within(folds[1]).getAllByRole('row')).toHaveLength(21);
  });

  it('24 players: counts the 8 that go on and the 16 that do not, with the overall ranking folded', async () => {
    const { container } = await show(groups24State(2, strongerPairWins), { 'setpoint.ranking.view.host': 'summary' });
    const count = (label: RegExp): string =>
      screen.getByText(label).closest('.count')!.textContent.replace(/\s+/g, ' ');
    expect(count(/vão para a final/)).toContain('8');
    expect(count(/ficam de fora/)).toContain('16');
    expect(screen.queryByText(/passam direto/)).toBeNull();
    const folds = [...container.querySelectorAll<HTMLDetailsElement>('details.fold')];
    expect(folds).toHaveLength(1);
    expect(within(folds[0]).getByText('Ranking geral (24 atletas)')).toBeTruthy();
    // The closed group rows name the two best placed athletes by their overall place.
    const first = container.querySelectorAll<HTMLDetailsElement>('details.group-row')[1];
    expect(first.querySelector('summary')!.textContent).toMatch(/\d+º/);
  });
});

describe('RankingPageComponent: athletes tied across the cut line', () => {
  it('marks them with a chip and says that the organizer draws the order, until the draw is made', async () => {
    const state = groups24State(2, strongerPairWins);
    await show(state);
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    expect(
      within(race).getByText(
        '9 atletas empatados disputam as últimas 5 vagas. O organizador sorteia a ordem ao gerar as finais.',
      ),
    ).toBeTruthy();
    // The list shows the 8 places and the first one out: places 4 to 9 are among the tied.
    expect(within(race).getAllByText('empate')).toHaveLength(6);
    fireEvent.click(within(race).getByRole('button', { name: 'Ver todos (24)' }));
    expect(within(race).getAllByText('empate')).toHaveLength(9);
  });

  it('is gone once the tie was drawn', async () => {
    const state = groups24State(2, strongerPairWins);
    const ids = rankingBoard(state)!
      .list.filter((entry) => entry.tied)
      .map((entry) => entry.playerId);
    await show(withTieDraw(state, ids, ids, '2026-11-26T10:00:00.000Z'));
    expect(screen.queryByText('empate')).toBeNull();
    expect(screen.queryByText(/atletas empatados/)).toBeNull();
  });

  it('says it once when several ties are near the cut, instead of repeating a sentence', async () => {
    await show(groups20State(4, 3, sideAWins));
    const board = TestBed.inject(TournamentStore).board()!;
    expect(board.cutTies.length).toBeGreaterThan(1);
    const total = board.cutTies.reduce((sum, tie) => sum + tie.count, 0);
    const race = screen.getByRole('article', { name: 'Corrida para a final' });
    expect(
      within(race).getByText(
        `${total} atletas estão empatados perto da linha de corte. O organizador sorteia a ordem ao gerar as finais.`,
      ),
    ).toBeTruthy();
    expect(within(race).queryByText(/disputam/)).toBeNull();
  });

  it('shows the note in Resumo too', async () => {
    await show(groups24State(2, strongerPairWins), { 'setpoint.ranking.view.host': 'summary' });
    expect(screen.getByText(/9 atletas empatados disputam as últimas 5 vagas/)).toBeTruthy();
  });

  it('says nothing while a group match has no score', async () => {
    const open = groups24State(2, strongerPairWins);
    open.rounds[0].matches[0].scoreA = null;
    open.rounds[0].matches[0].scoreB = null;
    await show(open);
    expect(screen.queryByText('empate')).toBeNull();
    expect(screen.queryByText(/atletas empatados/)).toBeNull();
  });
});

describe('RankingPageComponent: the other group formats', () => {
  it('mixed doubles: the same board, with a gender icon on every athlete', async () => {
    const { container } = await show(mixedGroups24State(2, strongerPairWins));
    const groups = screen.getByRole('region', { name: 'Grupos' });
    expect(within(groups).getAllByRole('article')).toHaveLength(6);
    // 24 athletes in the cards and 9 in the list (the 8 that go on and the first one out).
    expect(groups.querySelectorAll('.gender-icon.male')).toHaveLength(12);
    expect(groups.querySelectorAll('.gender-icon.female')).toHaveLength(12);
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    expect(race.querySelectorAll('.gender-icon')).toHaveLength(9);
    expect(container.querySelector('.group-ranking-card')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ranking individual' })).toBeNull();
  });

  it('12 players: three groups and the cut after the 8th place', async () => {
    await show(groups12State(2, strongerPairWins));
    expect(within(screen.getByRole('region', { name: 'Grupos' })).getAllByRole('article')).toHaveLength(3);
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    expect(within(race).getByText('RANKING GERAL · 8 VAGAS NA FINAL')).toBeTruthy();
    expect(within(race).getByText('LINHA DE CORTE · 8 VAGAS')).toBeTruthy();
    expect(within(race).getByRole('button', { name: 'Ver todos (12)' })).toBeTruthy();
  });

  it('8 players: everybody goes on, so there is no cut line, no "Ver todos" and no count of those left out', async () => {
    await show(groups8State(2, strongerPairWins));
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    expect(within(race).getByText('RANKING GERAL · TODOS VÃO PARA A FINAL')).toBeTruthy();
    expect(within(race).queryByText(/LINHA DE CORTE/)).toBeNull();
    expect(within(race).queryByRole('button', { name: /Ver todos/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resumo' }));
    expect(screen.getByText(/vão para a final/)).toBeTruthy();
    expect(screen.queryByText(/ficam de fora/)).toBeNull();
  });

  it('fixed pairs: one group of pairs, one row per pair, a list of athletes, and no group badge', async () => {
    const { state } = fixedPairsState(12, 3);
    const { container } = await show(state);
    const groups = screen.getByRole('region', { name: 'Grupos' });
    const card = within(groups).getByRole('article', { name: 'Grupo A' });
    const buttons = within(card).getAllByRole('button', { description: 'Abre os jogos e a posição do atleta' });
    // Six pairs, each named with both partners.
    expect(buttons).toHaveLength(6);
    expect(buttons[0].textContent).toMatch(/\S+ \+ \S+/);
    const race = screen.getByRole('article', { name: 'Ranking geral' });
    // The finals take the 8 best athletes: header, the 8 that go on, the cut line and the first out.
    expect(within(race).getAllByRole('row')).toHaveLength(11);
    expect(container.querySelector('.gbadge')).toBeNull();

    // A pair opens its first partner.
    const store = TestBed.inject(TournamentStore);
    const open = vi.spyOn(store, 'openPlayerMatches').mockResolvedValue();
    fireEvent.click(buttons[0]);
    expect(open).toHaveBeenCalledWith(store.board()!.groups[0].entries[0].playerIds[0]);
  });
});
