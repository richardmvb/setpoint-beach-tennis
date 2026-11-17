import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * The organizer's pages that are not the scoring ones: Visão geral, Jogadores and Ajustes (the live link, the sync
 * card, the backup and "Iniciar novo torneio"), and that the store they share survives moving between pages.
 */

const ANALYTICS_ID = String(tournamentFixture()['analyticsId']);
const CREDENTIALS = { id: 'live-1', readToken: 'read-token-e2e', writeToken: 'write-token-e2e' };
const LIVE_KEY = `setpoint.local.live.${ANALYTICS_ID}`;

async function seed(page: Page, state: object, extra: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ({ value, items }) => {
      if (localStorage.getItem('setpoint.tournament.v1')) return;
      localStorage.setItem('setpoint.tournament.v1', JSON.stringify(value));
      for (const [key, item] of Object.entries(items)) localStorage.setItem(key, item);
    },
    { value: state, items: extra },
  );
}

const open = (page: Page, nav: RegExp) =>
  page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: nav }).click();

/** A shared tournament this device moderates: a sync record exists, so the shell treats it as the moderator's. */
function sharedModerator(): { state: object; queue: Record<string, string> } {
  const state = {
    ...tournamentFixture(),
    hostingMode: 'shared',
    sharedTournamentId: 'shared-1',
    sharedStatus: 'active',
  };
  return {
    state,
    queue: { 'setpoint.sync.shared.shared-1': JSON.stringify({ version: 1, base: state, pending: null, revision: 0 }) },
  };
}

test.describe('Ajustes: live link', () => {
  test('is created and copied, and the sync card appears', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const supabase = await mockSupabase(page);
    supabase.rpc('create_local_live_tournament', CREDENTIALS);
    supabase.rpc('sync_local_live_tournament', (params) => ({
      id: 'live-1',
      status: 'active',
      state: params['p_state'] as never,
    }));
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);

    await expect(page.getByText('Online e offline')).toHaveCount(0);
    await page.getByRole('button', { name: 'Gerar e copiar link' }).click();

    await expect(page.getByText('Link copiado. Envie para quem vai acompanhar.')).toBeVisible();
    const field = page.getByRole('textbox', { name: 'Link público de acompanhamento' });
    await expect(field).toHaveValue(/\?live=read-token-e2e$/);
    const link = await field.inputValue();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    const stored = await page.evaluate((key) => localStorage.getItem(key), LIVE_KEY);
    expect(JSON.parse(stored ?? 'null')).toEqual(CREDENTIALS);
    await expect(page.getByRole('button', { name: 'Copiar link ao vivo' })).toBeVisible();
    await expect(page.getByText('Online e offline')).toBeVisible();
    expect(supabase.calls('create_local_live_tournament')).toHaveLength(1);
  });

  test('says so when the publication fails', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.fail('create_local_live_tournament', 'rate limited');
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);
    await page.getByRole('button', { name: 'Gerar e copiar link' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível gerar o link ao vivo.' })).toBeVisible();
  });
});

test.describe('Ajustes: sync card', () => {
  test('the switch pauses the sync and the choice is remembered', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('sync_local_live_tournament', (params) => ({
      id: 'live-1',
      status: 'active',
      state: params['p_state'] as never,
    }));
    await seed(page, tournamentFixture(), { [LIVE_KEY]: JSON.stringify(CREDENTIALS) });
    await page.goto('/');
    await open(page, /Ajustes/);

    const toggle = page.getByRole('checkbox', { name: /Sincronização automática/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('setpoint.sync.paused'))).toBe('true');
    await expect(page.getByRole('main').getByText('Modo offline')).toBeVisible();
    await toggle.check();
    expect(await page.evaluate(() => localStorage.getItem('setpoint.sync.paused'))).toBe('false');
    await expect(page.getByRole('button', { name: 'Sincronizar agora' })).toBeDisabled();
  });
});

test.describe('Ajustes: backup and maintenance', () => {
  test('exports the tournament as a JSON file', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportar backup JSON/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^setpoint-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toMatchObject({
      name: tournamentFixture()['name'],
      size: 8,
    });
    await expect(page.getByText('Backup JSON exportado.')).toBeVisible();
  });

  test('imports a backup after confirming, replacing the tournament', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);

    const backup = { ...tournamentFixture(), name: 'Torneio importado E2E', analyticsId: 'imported-analytics-id' };
    await page.locator('input[type=file]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    const dialog = page.getByRole('alertdialog', { name: 'Importar este backup?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Importar backup' }).click();

    await expect(page.getByText('Backup carregado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Torneio importado E2E' })).toBeVisible();
  });

  test('a file that is not a backup is refused', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await expect(page.getByText('Arquivo inválido: selecione um backup JSON exportado pelo SETPOINT.')).toBeVisible();
  });

  test('"Iniciar novo torneio" clears the tournament and shows the landing page', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);
    await page.getByRole('button', { name: 'Iniciar novo torneio' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Iniciar um novo torneio?' });
    await dialog.getByRole('button', { name: /Novo torneio|Apagar e começar/ }).click();
    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
  });

  test('the rules are locked once the schedule exists, and the way back to the landing page works', async ({
    page,
  }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Ajustes/);
    await expect(page.getByRole('button', { name: 'Salvar configurações' })).toBeDisabled();
    await expect(page.getByText('Bloqueado após gerar a tabela.')).toBeVisible();
    await expect(page.getByLabel('Nome do torneio')).toBeDisabled();
    await page.getByRole('button', { name: 'Voltar para a página inicial' }).click();
    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
  });
});

test.describe('Visão geral', () => {
  test('shows the numbers, the progress and the elapsed time', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(3);
    await expect(page.getByText('Tabela pronta')).toBeVisible();
    await expect(page.getByText('Progresso')).toBeVisible();
    await expect(page.getByText('Tempo de torneio')).toBeVisible();
    await page.getByRole('button', { name: /Abrir partidas/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Partidas' })).toBeVisible();
  });

  test("a shared tournament's moderator copies and renews the invite and sees what happened", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const supabase = await mockSupabase(page);
    supabase.rpc('rotate_shared_invite', {
      inviteToken: 'renewed-invite-token',
      inviteExpiresAt: '2099-01-01T00:00:00Z',
    });
    const { state, queue } = sharedModerator();
    await seed(page, state, queue);
    await page.goto('/');

    const card = page.locator('.shared-invite-panel');
    await expect(card.getByRole('heading', { name: 'Link para acompanhar' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Recuperar link' })).toBeVisible();
    await card.getByRole('button', { name: 'Recuperar link' }).click();
    await expect(card.getByText('Novo link de convite criado. O link anterior foi invalidado.')).toBeVisible();
    const field = card.getByRole('textbox', { name: 'Link de convite' });
    await expect(field).toHaveValue(/\?invite=renewed-invite-token$/);
    expect(supabase.calls('rotate_shared_invite')).toEqual([{ p_tournament_id: 'shared-1' }]);

    await card.getByRole('button', { name: 'Copiar link' }).click();
    await expect(card.getByText('Link copiado.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.inputValue());
    await expect(card.getByRole('button', { name: 'Gerar novo link' })).toBeVisible();
  });

  test('a local tournament has no invite card', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await expect(page.locator('.shared-invite-panel')).toHaveCount(0);
  });
});

test.describe('Jogadores', () => {
  test('lists the roster and keeps the list locked', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Jogadores/);

    await expect(page.getByRole('heading', { level: 1, name: 'Jogadores' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jogadores inscritos' })).toBeVisible();
    await expect(page.locator('.player-row')).toHaveCount(8);
    await expect(page.getByText('Participante 01')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nome do jogador' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Adicionar' })).toBeDisabled();
    for (const remove of await page.getByRole('button', { name: 'Remover jogador' }).all())
      await expect(remove).toBeDisabled();
    await expect(page.getByRole('button', { name: /Gerar todas as rodadas/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Revisar configurações' })).toBeDisabled();
  });
});

test.describe('one store for every page', () => {
  test('a half-typed score survives a visit to another page', async ({ page }) => {
    await seed(page, tournamentFixture());
    await page.goto('/');
    await open(page, /Partidas/);
    const inputs = page.locator('input.inline-score');
    // The fixture scored match 1; match 2 is the next pair of fields. One of the two numbers is not a score yet.
    await inputs.nth(2).fill('3');
    await open(page, /Visão geral/);
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
    await open(page, /Partidas/);
    await expect(page.locator('input.inline-score').nth(2)).toHaveValue('3');
  });
});
