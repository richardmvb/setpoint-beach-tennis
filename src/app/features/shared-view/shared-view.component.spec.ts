import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import sharedPtBr from '../../../../public/i18n/shared/pt-BR.json';
import tournamentPtBr from '../../../../public/i18n/tournament/pt-BR.json';
import { FinalsService } from '../../core/finals.service';
import { pairQualifiers } from '../../domain/tournament-play/qualifier-pairs';
import { createStandingsMemo } from '../../domain/tournament-view/standings';
import { groupQualification } from '../../domain/tournament-view/group-qualification';
import { groups20State, strongerPairWins } from '../../testing/groups20';
import { MemoryStorage } from '../../testing/memory-storage';
import { PROFILE_KEY } from '../../core/profile';
import { translocoTesting } from '../../testing/transloco-testing';
import { storedTournament } from '../../testing/tournament-state';
import { sharedSnapshot, type SharedViewFakeOptions, sharedViewFakes } from './shared-view.fakes';
import { SharedViewComponent } from './shared-view.component';

async function setup(options: SharedViewFakeOptions, given: (fakes: ReturnType<typeof sharedViewFakes>) => void) {
  const fakes = sharedViewFakes(options);
  given(fakes);
  await render(SharedViewComponent, {
    imports: [translocoTesting({ 'shared/pt-BR': sharedPtBr, 'tournament/pt-BR': tournamentPtBr })],
    providers: fakes.providers,
  });
  return fakes;
}

describe('SharedViewComponent', () => {
  it('a live link shows the tournament read-only, with its progress', async () => {
    await setup({ url: { liveToken: 'live' } }, ({ live }) =>
      live.given('live', { id: 'live-1', status: 'active', state: { ...storedTournament(), name: 'Ao vivo' } }),
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Ao vivo' })).toBeTruthy();
    expect(screen.getByText('ACOMPANHAMENTO AO VIVO')).toBeTruthy();
    expect(screen.getByText('AO VIVO')).toBeTruthy();
    expect(screen.getByText('Super 8 · Acompanhando ao vivo')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Progresso do torneio' })).toBeTruthy();
    expect(screen.getByText('EM QUADRA AGORA')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entre no torneio' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says "loading", and nothing about any other tournament, until the tournament arrives', async () => {
    await setup({ url: { liveToken: 'slow' } }, ({ live }) => {
      live.getLocalLiveTournament = () => new Promise(() => undefined);
    });
    expect(screen.getByText('Carregando torneio…')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('an invalid link says so instead of loading', async () => {
    await setup({ url: { liveToken: 'wrong' } }, () => undefined);
    expect((await screen.findByRole('alert')).textContent?.trim()).toBe('Este link de acompanhamento não é válido.');
    expect(screen.queryByText('Carregando torneio…')).toBeNull();
  });

  it('an invite guest joins with a name and is marked in the roster', async () => {
    const fakes = await setup({ url: { inviteToken: 'invite' } }, ({ shared }) =>
      shared.given('invite', sharedSnapshot()),
    );

    expect(await screen.findByRole('heading', { name: 'Entre no torneio' })).toBeTruthy();
    expect(screen.getByText('TORNEIO COMPARTILHADO')).toBeTruthy();
    expect(screen.getByText('Inscrições abertas', { selector: 'b' })).toBeTruthy();
    const join = screen.getByRole('button', { name: 'Participar' });
    expect((join as HTMLButtonElement).disabled).toBe(true);

    fireEvent.input(screen.getByRole('textbox', { name: 'Seu nome' }), { target: { value: 'Convidada' } });
    fireEvent.click(join);

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Entre no torneio' })).toBeNull());
    expect(screen.getByText('você')).toBeTruthy();
    expect(screen.getByText('PARTICIPANTES · 2 / 8')).toBeTruthy();
    expect(fakes.shared.calls.at(-1)).toEqual({
      method: 'joinSharedTournament',
      args: ['invite', 'Convidada', 'male', undefined],
    });
  });

  it('an archived tournament opened by an admin offers its backup', async () => {
    URL.createObjectURL = () => 'blob:backup';
    URL.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: 'local' } }, ({ dashboard }) =>
      dashboard.given('local', { id: 't1', status: 'archived', state: storedTournament() }),
    );

    expect(await screen.findByText('Backup do torneio')).toBeTruthy();
    expect(screen.getAllByText('ARQUIVO ADMINISTRATIVO')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar backup JSON' }));

    expect(screen.getByRole('status').textContent?.trim()).toBe('Backup JSON exportado.');
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('shows the 20-player format: the qualifiers, who rests in a group of 5, and the bracket with byes', async () => {
    const played = groups20State(5, 3, strongerPairWins);
    const finals = new FinalsService();
    const pairs = pairQualifiers(groupQualification(played).seeding, 'crossed', () => 0);
    await setup({ url: { liveToken: 'live' } }, ({ live }) =>
      live.given('live', {
        id: 'live-20',
        status: 'active',
        state: { ...played, finals: finals.createByeBracket(pairs) },
      }),
    );
    // The group stage is over and the finals exist: the finals come first and the board folds into one row. A guest
    // starts on Resumo.
    expect(await screen.findByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    const board = document.getElementById('guest-ranking')!;
    expect(board.tagName).toBe('APP-RANKING-BOARD');
    expect(board.querySelector('details')?.open).toBe(false);
    expect(screen.getByText('Fase de grupos encerrada')).toBeTruthy();
    const bracketRegion = screen.getByRole('region', { name: 'Chave da fase final' });
    expect(bracketRegion.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/^Descansam: /).length).toBeGreaterThan(0);
    expect(bracketRegion).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Quartas 1' })).toBeTruthy();
    expect(screen.getAllByText('BYE')).toHaveLength(2);
    expect(screen.getByText('Vencedor QF2')).toBeTruthy();
  });

  it('keeps the plain list of matches, with no tree, for the Super finals', async () => {
    const played = storedTournament();
    const finals = new FinalsService();
    await setup({ url: { liveToken: 'live' } }, ({ live }) =>
      live.given('live', {
        id: 'live-super',
        status: 'active',
        state: { ...played, finals: finals.updatePodium(finals.create(createStandingsMemo()(played).all)) },
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Finais em andamento' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Chave da fase final' })).toBeNull();
  });
});

describe('SharedViewComponent: the ranking board views', () => {
  /** Ana (p1) is in the tournament; the guest is her, by the name saved on the device. */
  const withProfile = (): MemoryStorage => {
    const local = new MemoryStorage();
    local.setItem(PROFILE_KEY, JSON.stringify({ name: 'Ana', autoJoin: false }));
    return local;
  };

  it('a guest opens on Resumo with their own line, and the choice is remembered for guests only', async () => {
    const local = withProfile();
    await setup({ url: { liveToken: 'live' }, local }, ({ live }) =>
      live.given('live', { id: 'live-20', status: 'active', state: groups20State(4, 3) }),
    );
    expect(await screen.findByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resumo' }).getAttribute('aria-pressed')).toBe('true');
    // Nothing is scored yet in this tournament: the line says "hoje" and counts the matches left.
    expect(screen.getByText(/Você: Ana\./)).toBeTruthy();
    expect(screen.getByText(/Jogos restantes: 3\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Compacto' }));
    expect(await screen.findByRole('heading', { name: 'Corrida para a final' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Quem vai para a final' })).toBeNull();
    // The guest is marked in the list too, next to their name.
    expect(screen.getAllByText('VOCÊ').length).toBeGreaterThan(0);
    expect(local.getItem('setpoint.ranking.view.guest')).toBe('compact');
    expect(local.getItem('setpoint.ranking.view.host')).toBeNull();
  });

  it('a guest comes back to the view they chose', async () => {
    const local = withProfile();
    local.setItem('setpoint.ranking.view.guest', 'compact');
    await setup({ url: { liveToken: 'live' }, local }, ({ live }) =>
      live.given('live', { id: 'live-20', status: 'active', state: groups20State(4, 3, strongerPairWins) }),
    );
    expect(await screen.findByRole('heading', { name: 'Corrida para a final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compacto' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says where the guest stands once the group stage is over, without "hoje"', async () => {
    await setup({ url: { liveToken: 'live' }, local: withProfile() }, ({ live }) =>
      live.given('live', { id: 'live-20', status: 'active', state: groups20State(4, 3, strongerPairWins) }),
    );
    expect(await screen.findByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    expect(screen.getByText(/Você: Ana\./)).toBeTruthy();
    // The sentence is the text of the line itself, next to the bold name.
    const line = screen.getByText(/º no Grupo [A-E]\. Você (passa|ficou fora)/);
    expect(line.textContent).not.toContain('Hoje');
    expect(line.textContent).not.toContain('Jogos restantes');
  });

  it('has no line for a guest whose name is not in the tournament', async () => {
    const local = new MemoryStorage();
    local.setItem(PROFILE_KEY, JSON.stringify({ name: 'Visitante', autoJoin: false }));
    await setup({ url: { liveToken: 'live' }, local }, ({ live }) =>
      live.given('live', { id: 'live-20', status: 'active', state: groups20State(4, 3) }),
    );
    expect(await screen.findByRole('heading', { name: 'Quem vai para a final' })).toBeTruthy();
    expect(screen.queryByText(/Você:/)).toBeNull();
  });

  it('the admin viewer starts on Compacto, like the organizer', async () => {
    await setup({ url: { dashboardViewerId: 't1', dashboardViewerSource: 'local' } }, ({ dashboard }) =>
      dashboard.given('local', { id: 't1', status: 'active', state: groups20State(4, 3, strongerPairWins) }),
    );
    expect(await screen.findByRole('heading', { name: 'Corrida para a final' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compacto' }).getAttribute('aria-pressed')).toBe('true');
  });
});
