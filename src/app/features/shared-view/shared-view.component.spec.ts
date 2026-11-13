import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';
import sharedPtBr from '../../../../public/i18n/shared/pt-BR.json';
import tournamentPtBr from '../../../../public/i18n/tournament/pt-BR.json';
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
});
