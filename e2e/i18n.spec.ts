import { expect, test } from './support/fixtures';

/**
 * Translations (docs/adr/0004-transloco-setup.md) are JSON files the app fetches at runtime from `i18n/`, next to the
 * app, so they follow the base href. The shell footer is the first text served from them.
 */
test.describe('translations', () => {
  test('the shell text comes from the pt-BR file the app fetches', async ({ page }) => {
    const translation = page.waitForResponse((response) => new URL(response.url()).pathname === '/i18n/pt-BR.json');

    await page.goto('/');

    const response = await translation;
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).searchParams.get('v'), 'the build id busts the cache').toBeTruthy();
    await expect(page.locator('.app-footer .build-id')).toHaveAttribute('title', 'Versão do aplicativo');
  });
});
