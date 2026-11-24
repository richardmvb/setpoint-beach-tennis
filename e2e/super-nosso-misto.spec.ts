import { expect, test } from './support/fixtures';

test('o guia é acessível diretamente e suas simulações funcionam', async ({ page }) => {
  const response = await page.goto('/super-nosso-misto.html');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Todo mundo em quadra.' })).toBeVisible();

  await page.getByRole('button', { name: 'Próximo: Rodadas' }).click();
  await page.getByLabel('Onde você estaria nesta rodada?').selectOption('TATI');
  await expect(page.locator('#player-result')).toContainText('quadra 1 com RICHARD');
  await page.getByRole('button', { name: 'Rodada 2' }).click();
  await expect(page.locator('#player-result')).toContainText('descansa');

  await page.getByRole('button', { name: 'Próximo: Quando parar' }).click();
  await page.getByRole('button', { name: '4 rodadas' }).click();
  await expect(page.locator('#balance-title')).toHaveText('Contagem equilibrada!');
});
