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

  test('explains the place in the Posição block, and the comparison opens from it', async ({ page }) => {
    await createLocalTournament(page);
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await page.locator('button.ranking-player-button').nth(1).click();
    const dialog = page.getByRole('dialog', { name: /./ });
    await expect(dialog.getByRole('heading', { name: 'POSIÇÃO' })).toBeVisible();
    await expect(dialog.getByText(/2º no ranking geral/)).toBeVisible();
    await expect(dialog.getByText(/^Atrás de .+ \(1º\)$/)).toBeVisible();
    await expect(dialog.getByText(/^À frente de .+ \(3º\)$/)).toBeVisible();
  });
});

test.describe('ranking: the tie-break order and the hint', () => {
  test.use({ onboarding: { skipLanding: true, disableTour: true, skipProfilePrompt: true, skipRankingHint: false } });

  test('shows the hint until an athlete is opened, and "Como funciona" explains the format', async ({ page }) => {
    await createLocalTournament(page);
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    const hint = page.getByText('Toque num atleta para ver os jogos e a posição');
    await expect(hint).toBeVisible();
    await expect(page.getByRole('list', { name: 'DESEMPATE' }).getByRole('listitem')).toHaveCount(5);

    await page.getByRole('button', { name: /Como funciona/ }).click();
    const help = page.getByRole('dialog', { name: 'Como funciona o ranking' });
    await expect(help.getByText('Os 8 vão para a final')).toBeVisible();
    await help.getByRole('button', { name: 'Entendi' }).click();
    await expect(help).toHaveCount(0);

    await page.locator('button.ranking-player-button').first().click();
    await page.getByRole('dialog', { name: /./ }).getByRole('button', { name: 'Fechar' }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    await expect(hint).toHaveCount(0);
  });
});
