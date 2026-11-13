import { createLocalTournament, expect, test } from './support/fixtures';

test.describe('ranking: matches of one player', () => {
  test('opens the player history without Angular change-detection errors', async ({ page }) => {
    // NG0100 (ExpressionChangedAfterItHasBeenChecked) is only raised by the dev server's second check pass,
    // which is where e2e runs, so a console error here is a real bug that production would hide.
    const angularErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /NG0\d+/.test(message.text())) angularErrors.push(message.text());
    });
    page.on('pageerror', (error) => angularErrors.push(error.message));

    await createLocalTournament(page);
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();

    await page.locator('button.ranking-player-button').first().click();

    const dialog = page.getByRole('dialog', { name: /./ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('HISTÓRICO DO ATLETA')).toBeVisible();
    await expect(dialog.locator('.player-match-detail').first()).toBeVisible();
    await expect(dialog.locator('.player-match-detail').first()).toContainText('Rodada 1');
    expect(angularErrors, 'Angular errors while opening the player history').toEqual([]);
  });
});
