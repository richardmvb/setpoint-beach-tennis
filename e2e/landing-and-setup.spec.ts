import { expect, PLAYER_NAMES, test } from './support/fixtures';

test.describe('landing page', () => {
  test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });

  test('a first visit shows the landing page and its call to action opens the setup wizard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();

    await page
      .getByRole('button', { name: /Criar meu torneio/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
  });
});

test.describe('setup wizard', () => {
  test('walks from configuration to players to review, and needs enough players to continue', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    await page.locator('#setupName').fill('Super de sábado E2E');

    await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
    await expect(page.getByRole('heading', { name: 'Inscreva os participantes' })).toBeVisible();
    await expect(page.getByText('Faltam 8 jogadores.')).toBeVisible();

    await page.getByRole('button', { name: /Adicionar em lote/ }).click();
    await page.locator('textarea[name=batchPlayers]').fill(PLAYER_NAMES.join('\n'));
    await page.getByRole('button', { name: /Gerar prévia/ }).click();
    await page.getByRole('button', { name: /Adicionar 8 participante/ }).click();

    await page.getByRole('button', { name: /Revisar torneio/ }).click();
    await expect(page.getByRole('heading', { name: 'Revisar e iniciar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Gerar tabela e iniciar/ })).toBeEnabled();
  });
});
