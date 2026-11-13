import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import dashboardPtBr from '../../../../public/i18n/dashboard/pt-BR.json';
import {
  dashboardActivity,
  dashboardInsights,
  dashboardMetrics,
  dashboardTournament,
} from '../../testing/dashboard-data';
import { translocoTesting } from '../../testing/transloco-testing';
import { DashboardComponent } from './dashboard.component';
import { dashboardFakes } from './dashboard.fakes';

async function setup(options: { signedIn?: boolean; insights?: boolean } = {}) {
  const fakes = await dashboardFakes({ signedIn: options.signedIn });
  fakes.dashboard.givenMetrics(dashboardMetrics());
  fakes.dashboard.givenActivity(
    dashboardActivity({
      active_tournaments: [
        dashboardTournament({ id: 'x', name: 'Copa Verão', source: 'local', mode: 'groups', size: 12 }),
        dashboardTournament({ id: 'y', name: 'Liga de quinta' }),
      ],
    }),
  );
  fakes.dashboard.givenInsights(options.insights === false ? null : dashboardInsights());
  let backs = 0;
  await render(DashboardComponent, {
    imports: [translocoTesting({ 'dashboard/pt-BR': dashboardPtBr })],
    providers: fakes.providers,
    on: { back: () => backs++ },
  });
  return { ...fakes, backs: () => backs };
}

describe('DashboardComponent', () => {
  it('asks for the authorized e-mail and says when the link was sent', async () => {
    const { auth } = await setup();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('ACESSO RESTRITO')).toBeTruthy();
    const send = screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar link de acesso' });
    expect(send.disabled).toBe(true);

    fireEvent.input(screen.getByLabelText('E-mail'), { target: { value: 'admin@example.com' } });
    fireEvent.click(send);

    expect(await screen.findByText('Link enviado. Confira sua caixa de entrada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reenviar link' })).toBeTruthy();
    expect(auth.loginRequests.map((request) => request.email)).toEqual(['admin@example.com']);
  });

  it('signed in, shows the summary and switches tabs', async () => {
    const { backs } = await setup({ signedIn: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Visão do produto' })).toBeTruthy();
    expect(screen.getByText('DASHBOARD · v7')).toBeTruthy();
    expect(screen.getByText('3 em andamento')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Resumo' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Torneios por dia' })).toBeTruthy();
    expect(screen.getAllByText('60% do início')).toHaveLength(2);

    fireEvent.click(screen.getByRole('tab', { name: 'Uso e recursos' }));
    expect(await screen.findByRole('heading', { name: 'O que as pessoas organizam' })).toBeTruthy();
    expect(screen.getByText('Neste dispositivo')).toBeTruthy();
    expect(screen.getByText('12 atletas')).toBeTruthy();
    expect(screen.getByText('Acompanhamento ao vivo')).toBeTruthy();
    expect(screen.getByText('3 ou mais')).toBeTruthy();
    expect(screen.getByText('Sáb')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao app' }));
    expect(backs()).toBe(1);
  });

  it('switches the period', async () => {
    const { dashboard } = await setup({ signedIn: true });
    const week = await screen.findByRole('radio', { name: '7 dias' });
    fireEvent.click(week);
    await waitFor(() => expect(dashboard.insightReads).toEqual([30, 7]));
    await waitFor(() => expect(week.getAttribute('aria-checked')).toBe('true'));
  });

  it('lists tournaments with viewer links, searches them and shows where others stopped', async () => {
    await setup({ signedIn: true });
    fireEvent.click(await screen.findByRole('tab', { name: 'Torneios' }));
    const list = (await screen.findByRole('heading', { name: 'Torneios', level: 2 })).closest('section') as HTMLElement;
    expect(within(list).getByText('Local ao vivo · Grupos 12')).toBeTruthy();
    const links = within(list).getAllByRole('link', { name: 'Visualizar ↗' });
    expect(links[0]?.getAttribute('href')).toBe(
      'https://example.test/setpoint-beach-tennis/?dashboardTournament=x&source=local',
    );

    fireEvent.input(within(list).getByRole('searchbox', { name: 'Buscar torneio' }), { target: { value: 'liga' } });
    await waitFor(() => expect(within(list).getAllByRole('link')).toHaveLength(1));
    fireEvent.input(within(list).getByRole('searchbox', { name: 'Buscar torneio' }), { target: { value: 'nada' } });
    expect(await within(list).findByText('Nenhum torneio encontrado.')).toBeTruthy();

    expect(screen.getByText('12 registros')).toBeTruthy();
    expect(screen.getAllByText('Menos da metade das partidas').length).toBe(2);
    expect(screen.getByText('1h 30min')).toBeTruthy();
    expect(screen.getByText('66.7%')).toBeTruthy();
  });

  it("shows the auth service's message when the link cannot be sent", async () => {
    const { auth } = await setup();
    auth.requestModeratorLogin = () => Promise.reject(new Error('Error sending magic link email'));
    fireEvent.input(screen.getByLabelText('E-mail'), { target: { value: 'admin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link de acesso' }));
    expect(await screen.findByText('Error sending magic link email')).toBeTruthy();
    expect(screen.getByLabelText('E-mail').getAttribute('aria-invalid')).toBe('true');
  });

  it('an account without access is told so, and a session that ends shows that, not a send error', async () => {
    const fakes = await dashboardFakes({ signedIn: true });
    await render(DashboardComponent, {
      imports: [translocoTesting({ 'dashboard/pt-BR': dashboardPtBr })],
      providers: fakes.providers,
    });
    const text = 'Acesso não autorizado ou métricas indisponíveis. Entre com uma conta moderadora autorizada.';
    expect((await screen.findByRole('alert')).textContent?.trim()).toBe(text);
    fakes.auth.simulateSignOut();
    await waitFor(() => expect(screen.getByText('ACESSO RESTRITO')).toBeTruthy());
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('the archived list explains itself and opens tournaments to consult', async () => {
    await setup({ signedIn: true });
    fireEvent.click(await screen.findByRole('tab', { name: 'Torneios' }));
    fireEvent.click(await screen.findByRole('tab', { name: /Arquivados/ }));
    expect(
      await screen.findByText(
        'Compartilhados e locais publicados ao vivo preservados no banco, com opção de exportar backup.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Consultar ↗' })).toBeTruthy();
  });

  it('says the database needs the insights migration', async () => {
    await setup({ signedIn: true, insights: false });
    expect(
      await screen.findByText(
        'Os novos indicadores precisam da migration 202611090002_dashboard_insights.sql no Supabase.',
      ),
    ).toBeTruthy();
  });
});
