import { expect, PLAYER_NAMES, test } from './support/fixtures';
import { seedTwoTournaments } from './support/library';

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

  test('leaving the landing is remembered: the next visit opens the app', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir o app' }).click();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toHaveCount(0);
  });

  test('with saved tournaments, "Retomar um torneio" opens Meus torneios', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Meus torneios 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver como funciona' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Retomar um torneio' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Meus torneios' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveCount(2);
  });

  test('on a phone the top bar hides "Meus torneios", and the hero still offers to resume', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedTwoTournaments(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Do sorteio ao pódio/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Meus torneios 2' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Retomar um torneio' }).first()).toBeVisible();
  });

  test('the section links scroll to their section', async ({ page }) => {
    await page.goto('/');
    const steps = page.getByRole('heading', { name: 'Quatro passos e bora para areia.' });
    await expect(steps).not.toBeInViewport();
    await page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Como funciona' }).click();
    await expect(steps).toBeInViewport();
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
