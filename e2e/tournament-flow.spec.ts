import {
  completeFinalMatches,
  completeRoundMatches,
  createLocalTournament,
  expect,
  generateFinals,
  test,
} from './support/fixtures';

test.describe('tournament from draw to podium', () => {
  test('creates an 8-player tournament, scores every round, plays the finals and shows the podium', async ({
    page,
  }) => {
    // Seven rounds, finals and podium in one journey: about 25 s alone, so give it more room under load.
    test.slow();
    await createLocalTournament(page);

    // Group stage: 8 players play 7 rounds of 2 matches each.
    await expect(page.locator('.round-tabs button')).toHaveCount(7);
    await completeRoundMatches(page);

    // Ranking: every player has played all 7 games and the finals can be generated.
    await page.getByRole('button', { name: 'Ranking e finais →' }).first().click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    await expect(page.getByText('7 de 7 jogos')).toHaveCount(8);

    await generateFinals(page);

    // Finals: scoring both matches produces the final classification and the finish action.
    await completeFinalMatches(page);
    await expect(page.getByRole('button', { name: 'Finalizar torneio' })).toBeVisible();
    for (const place of ['1º', '2º', '3º', '4º']) {
      await expect(page.getByText(place, { exact: true }).first()).toBeVisible();
    }
  });

  test('a score only saves when it is valid for the games-to-win rule', async ({ page }) => {
    await createLocalTournament(page);
    const inputs = page.locator('input.inline-score');

    // 3 to 2 is not a finished game (the default is 4 games to win), so nothing is saved.
    await inputs.nth(0).fill('3');
    await inputs.nth(1).fill('2');
    await expect(page.getByText('Placar incompleto ou inválido').first()).toBeVisible();
    await expect(page.getByText('Placar salvo')).toHaveCount(0);

    // 4 to 2 is valid and saves automatically.
    await inputs.nth(0).fill('4');
    await expect(page.getByText('Placar salvo')).toHaveCount(1);
    await expect(page.getByText('Salvo automaticamente').first()).toBeVisible();
  });
});
