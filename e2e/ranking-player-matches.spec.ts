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

  test('is a modal dialog: focus stays inside, Escape closes it and focus returns to the player', async ({ page }) => {
    await createLocalTournament(page);
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    const player = page.locator('button.ranking-player-button:visible').first();
    await player.click();

    const dialog = page.getByRole('dialog', { name: /./ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(player).toBeFocused();
  });

  test('the close button closes it', async ({ page }) => {
    await createLocalTournament(page);
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await page.locator('button.ranking-player-button').first().click();
    const dialog = page.getByRole('dialog', { name: /./ });
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
