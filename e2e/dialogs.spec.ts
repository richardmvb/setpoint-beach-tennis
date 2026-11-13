import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { openLibrary, seedTwoTournaments } from './support/library';

/**
 * Confirmation dialogs (ui/dialog on the CDK). The library's delete confirmation is the easiest way to open one:
 * it is a destructive (danger) confirmation titled "Excluir este torneio salvo?".
 */
async function openDeleteConfirmation(page: Page) {
  await seedTwoTournaments(page);
  await page.goto('/');
  const library = await openLibrary(page);
  const trigger = library.getByRole('button', { name: 'Excluir Torneio antigo' });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Excluir este torneio salvo?' });
  await expect(dialog).toBeVisible();
  return { library, trigger, dialog };
}

const focusIsInside = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest('[role="alertdialog"]') !== null);

test.describe('confirmation dialog', () => {
  test('is an alert dialog named by its title, with the safe choice focused for a destructive action', async ({
    page,
  }) => {
    const { dialog } = await openDeleteConfirmation(page);

    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(/removido deste dispositivo/);
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Excluir', exact: true })).toBeVisible();
  });

  test('Escape cancels, keeps the tournament and returns focus to the button that opened it', async ({ page }) => {
    const { library, trigger, dialog } = await openDeleteConfirmation(page);

    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(library.getByRole('listitem')).toHaveCount(2);
    await expect(trigger).toBeFocused();
  });

  test('keeps keyboard focus inside while it is open', async ({ page }) => {
    await openDeleteConfirmation(page);

    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(page), `after Tab ${step + 1}`).toBe(true);
    }
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInside(page), `after Shift+Tab ${step + 1}`).toBe(true);
    }
  });

  test('a click outside cancels it', async ({ page }) => {
    const { library, dialog } = await openDeleteConfirmation(page);

    await page.locator('.cdk-overlay-backdrop').click({ position: { x: 4, y: 4 } });

    await expect(dialog).toHaveCount(0);
    await expect(library.getByRole('listitem')).toHaveCount(2);
  });

  test('Cancel closes it and Confirm deletes', async ({ page }) => {
    const { library, dialog } = await openDeleteConfirmation(page);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(library.getByRole('listitem')).toHaveCount(2);

    await library.getByRole('button', { name: 'Excluir Torneio antigo' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(library.getByRole('listitem')).toHaveCount(1);
  });

  test('is a bottom sheet on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const { dialog } = await openDeleteConfirmation(page);

    const box = await page.locator('.ui-dialog').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(388);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(798);
    await expect(dialog).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no accessibility violations in the ${theme} theme`, async ({ page }) => {
      const { dialog } = await openDeleteConfirmation(page);
      if (theme === 'dark') await page.evaluate(() => (document.documentElement.dataset['theme'] = 'dark'));
      // Let the theme's color transition finish before measuring contrast.
      await page.waitForTimeout(500);
      await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
      });
      await expect(dialog).toBeVisible();

      const results = await new AxeBuilder({ page })
        .include('.ui-dialog')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
    });
  }
});
