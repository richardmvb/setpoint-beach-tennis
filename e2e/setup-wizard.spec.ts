import { expect, PLAYER_NAMES, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * The setup wizard: moving between its steps, adding athletes (typed and in a batch), and a moderator creating a
 * shared tournament. The batch dialog is a CDK dialog: while it is open the page behind it is out of the
 * accessibility tree, so the opener is found by CSS.
 */

const openBatch = (page: import('@playwright/test').Page) => page.locator('.batch-entry-button');

test.describe('setup wizard: steps', () => {
  test('the progress bar and "← Voltar" go back and keep what was chosen', async ({ page }) => {
    await page.goto('/');
    await page.locator('#setupName').fill('Torneio de volta');
    await page.getByRole('radio', { name: /Duplas mistas/ }).click();
    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Etapas da configuração' })
      .getByRole('button', { name: /Configuração/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    await expect(page.locator('#setupName')).toHaveValue('Torneio de volta');
    await expect(page.getByRole('radio', { name: /Duplas mistas/ })).toBeChecked();

    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await expect(page.getByRole('button', { name: /Faltam 8/ })).toBeDisabled();
    // The step after the current one cannot be opened from the bar.
    await expect(
      page.getByRole('navigation', { name: 'Etapas da configuração' }).getByRole('button', { name: /Início/ }),
    ).toBeDisabled();
  });

  test('step 3 shows the review and "← Voltar" returns to the players', async ({ page }) => {
    await page.goto('/');
    await page.locator('#setupName').fill('Revisão');
    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await openBatch(page).click();
    await page.locator('textarea[name=batchPlayers]').fill(PLAYER_NAMES.join('\n'));
    await page.getByRole('button', { name: 'Gerar prévia' }).click();
    await page.getByRole('button', { name: /Adicionar 8 participante/ }).click();
    await page.getByRole('button', { name: /Revisar torneio/ }).click();

    await expect(page.getByRole('heading', { name: 'Revisar e iniciar' })).toBeVisible();
    await expect(page.locator('#reviewSummary')).toContainText('Super 8');
    await expect(page.locator('.roster-chip')).toHaveCount(8);
    await page.getByRole('button', { name: /Voltar/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
    await expect(page.getByText('8 / 8')).toBeVisible();
  });
});

test.describe('setup wizard: adding athletes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
  });

  test('typing a name and pressing Enter adds it and keeps the field ready for the next one', async ({ page }) => {
    const field = page.locator('#wizardPlayerName');
    await field.fill('Ana');
    await field.press('Enter');
    await expect(page.getByText('Participante 01')).toBeVisible();
    await expect(page.getByText('Faltam 7 jogadores.')).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('');
  });

  test('a repeated name is refused with a message that clears when the name changes', async ({ page }) => {
    const field = page.locator('#wizardPlayerName');
    await field.fill('Ana');
    await field.press('Enter');
    await field.fill('ana');
    await field.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Já existe um participante com esse nome.');
    await field.fill('Bia');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a player is removed from the list', async ({ page }) => {
    const field = page.locator('#wizardPlayerName');
    await field.fill('Ana');
    await field.press('Enter');
    await page.getByRole('button', { name: 'Remover jogador' }).click();
    await expect(page.getByText('Participante 01')).toHaveCount(0);
  });

  test('the batch dialog takes the cursor, shows what is wrong and closes with Escape, returning focus', async ({
    page,
  }) => {
    await openBatch(page).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar participantes em lote' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Lista de participantes' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(openBatch(page)).toBeFocused();
  });

  test('a pasted list is previewed, errors block it, and the confirmed list joins the roster', async ({ page }) => {
    await openBatch(page).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar participantes em lote' });
    await dialog.getByRole('textbox', { name: 'Lista de participantes' }).fill('Ana\nAna\nBruno');
    await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
    await expect(dialog.getByText('3 na lista')).toBeVisible();
    await expect(dialog.getByText('Nome duplicado.')).toBeVisible();
    const confirm = dialog.getByRole('button', { name: /Adicionar 3 participante/ });
    await expect(confirm).toBeDisabled();

    await dialog.getByRole('textbox', { name: 'Nome do participante' }).nth(1).fill('Carla');
    await expect(dialog.getByText('Nome duplicado.')).toHaveCount(0);
    await confirm.click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Participantes adicionados em lote.')).toBeVisible();
    await expect(page.getByText('3 / 8')).toBeVisible();
    await expect(page.locator('.player-row .player-info b')).toHaveText(['Ana', 'Carla', 'Bruno']);
  });

  test('in mixed doubles the batch asks for each category', async ({ page }) => {
    await page
      .getByRole('navigation', { name: 'Etapas da configuração' })
      .getByRole('button', { name: /Configuração/ })
      .click();
    await page.getByRole('radio', { name: /Duplas mistas/ }).click();
    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await openBatch(page).click();
    const dialog = page.getByRole('dialog', { name: 'Adicionar participantes em lote' });
    await dialog.getByRole('textbox', { name: 'Lista de participantes' }).fill('Ana, F\nBruno');
    await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
    await expect(dialog.getByText('Selecione a categoria.')).toBeVisible();
    await dialog.getByRole('radiogroup', { name: 'Categoria de Bruno' }).getByRole('radio').first().click();
    await expect(dialog.getByText('Selecione a categoria.')).toHaveCount(0);
    await dialog.getByRole('button', { name: /Adicionar 2 participante/ }).click();
    await expect(page.getByText('2 / 8')).toBeVisible();
  });

  test('"Ver tutorial" opens the tour of the step', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver tutorial' }).click();
    await expect(page.locator('.driver-popover')).toBeVisible();
    await expect(page.locator('.driver-popover-title')).toHaveText('Adicione os atletas');
  });
});

test.describe('setup wizard: shared tournament (moderator)', () => {
  const snapshot = (players: { id: string; name: string; manual?: boolean }[], inviteToken = 'invite-abc') => ({
    id: 'shared-1',
    status: 'registration',
    capacity: 8,
    inviteToken,
    inviteExpiresAt: '2099-01-01T00:00:00Z',
    expiresAt: null,
    state: {
      ...tournamentFixture(),
      name: 'Compartilhado E2E',
      hostingMode: 'shared',
      sharedTournamentId: 'shared-1',
      sharedStatus: 'registration',
      players,
      rounds: [],
      startedAt: undefined,
    },
  });

  test('creates the tournament, adds an athlete without a phone, renews the link and cancels', async ({ page }) => {
    const supabase = await mockSupabase(page);
    let players = [{ id: 'm1', name: 'Moderadora' }] as { id: string; name: string; manual?: boolean }[];
    let token = 'invite-abc';
    supabase.rpc('create_shared_tournament', () => snapshot(players, token));
    supabase.rpc('get_owned_shared_tournament', () => snapshot(players, token));
    supabase.rpc('add_shared_participant', (params) => {
      players = [...players, { id: 'x1', name: String(params['p_display_name']), manual: true }];
      return snapshot(players, token);
    });
    supabase.rpc('rotate_shared_invite', () => {
      token = 'invite-new';
      return { inviteToken: token, inviteExpiresAt: '2099-01-02T00:00:00Z' };
    });
    supabase.rpc('cancel_shared_tournament', null);

    await page.goto('/');
    await page.getByRole('radio', { name: /Compartilhado/ }).click();
    await page.locator('#setupName').fill('Compartilhado E2E');
    await page.getByRole('button', { name: /Criar torneio compartilhado/ }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('Informe seu nome para entrar como moderador.')).toBeVisible();
    await page.locator('#moderatorName').fill('Moderadora');
    await page.getByRole('button', { name: /Criar torneio compartilhado/ }).click();

    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
    await expect(
      page.getByText('Torneio compartilhado criado. Envie o convite para preencher as vagas.'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Link de convite' })).toHaveValue(/\?invite=invite-abc$/);
    const [created] = supabase.calls('create_shared_tournament');
    expect(created).toMatchObject({ p_name: 'Compartilhado E2E', p_capacity: 8, p_moderator_name: 'Moderadora' });

    await page.getByRole('textbox', { name: 'Nome do participante sem celular' }).fill('Sem celular');
    await page.getByRole('button', { name: 'Adicionar participante' }).click();
    await expect(page.getByText('Sem celular', { exact: true })).toBeVisible();
    await expect(page.getByText('2 / 8')).toBeVisible();
    expect(supabase.calls('add_shared_participant')[0]).toMatchObject({
      p_tournament_id: 'shared-1',
      p_display_name: 'Sem celular',
    });

    await page.getByRole('button', { name: 'Novo link' }).click();
    await expect(page.getByText('Novo link de convite criado. O link anterior foi invalidado.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Link de convite' })).toHaveValue(/\?invite=invite-new$/);

    await page.getByRole('button', { name: 'Cancelar e recomeçar' }).click();
    await page.getByRole('button', { name: 'Arquivar e recomeçar' }).click();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    expect(supabase.calls('cancel_shared_tournament')).toEqual([{ p_tournament_id: 'shared-1' }]);
  });

  test("a guest who joins by the invite link appears on the moderator's step 2 (poll)", async ({ page }) => {
    const supabase = await mockSupabase(page);
    let players = [{ id: 'm1', name: 'Moderadora' }] as { id: string; name: string; manual?: boolean }[];
    supabase.rpc('create_shared_tournament', () => snapshot(players));
    supabase.rpc('get_owned_shared_tournament', () => snapshot(players));
    await page.goto('/');
    await page.getByRole('radio', { name: /Compartilhado/ }).click();
    await page.locator('#moderatorName').fill('Moderadora');
    await page.getByRole('button', { name: /Criar torneio compartilhado/ }).click();
    await expect(page.getByText('1 / 8')).toBeVisible();

    players = [...players, { id: 'g1', name: 'Convidada pelo link' }];
    await expect(page.getByText('Convidada pelo link')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2 / 8')).toBeVisible();
    await expect(page.getByText('Faltam 6 participantes entrarem pelo link.')).toBeVisible();
  });

  test('a refused creation shows the server message and stays on step 1', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.fail('create_shared_tournament', 'authentication_required');
    await page.goto('/');
    await page.getByRole('radio', { name: /Compartilhado/ }).click();
    await page.locator('#moderatorName').fill('Moderadora');
    await page.getByRole('button', { name: /Criar torneio compartilhado/ }).click();
    await expect(page.getByRole('alert')).toHaveText('Não foi possível autenticar a publicação. Tente novamente.');
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });

  test('a reload brings the moderator back to step 2 of the same tournament', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const players = [{ id: 'm1', name: 'Moderadora' }];
    supabase.rpc('create_shared_tournament', snapshot(players));
    supabase.rpc('get_owned_shared_tournament', snapshot(players));
    await page.goto('/');
    await page.getByRole('radio', { name: /Compartilhado/ }).click();
    await page.locator('#moderatorName').fill('Moderadora');
    await page.getByRole('button', { name: /Criar torneio compartilhado/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Link de convite' })).toHaveValue(/\?invite=invite-abc$/);
  });
});
