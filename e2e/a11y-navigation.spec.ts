import { createLocalTournament, expect, test } from './support/fixtures';

/**
 * What the keyboard and a screen reader get from the shell: a skip link, a title and a focused heading for each screen,
 * and no motion when the person asked for none. The axe ratchet (accessibility.spec.ts) covers the markup itself.
 */
test.describe('skip link', () => {
  test('is the first stop, shows while focused, and moves focus to the content without changing the address', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Novo torneio' })).toBeVisible();
    const address = page.url();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Ir para o conteúdo' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
    expect(page.url()).toBe(address);
  });

  test('is hidden until it has focus', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Novo torneio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para o conteúdo' })).not.toBeInViewport();
  });
});

test.describe('title and focus on a screen change', () => {
  test('the title names the page, and focus goes to its heading after a navigation (not on the first load)', async ({
    page,
  }) => {
    await createLocalTournament(page);
    await expect(page).toHaveTitle('Partidas · SETPOINT');
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page).toHaveTitle('Ranking · SETPOINT');
    await expect(page.getByRole('heading', { level: 1, name: 'Ranking' })).toBeFocused();
    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    await expect(page).toHaveTitle('Ajustes · SETPOINT');
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeFocused();
  });

  test('a reload only sets the title and leaves focus where the browser puts it', async ({ page }) => {
    await createLocalTournament(page);
    await page.reload();
    await expect(page).toHaveTitle('Visão geral · SETPOINT');
    await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
  });

  test('does not take focus from a dialog', async ({ page }) => {
    await createLocalTournament(page);
    await page.getByRole('button', { name: 'Perfil' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null)).toBe(true);
    // The page behind a modal dialog is out of the accessibility tree, so find the heading by CSS.
    await expect(page.locator('h1').first()).not.toBeFocused();
  });

  test.describe('landing page', () => {
    test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: true } });
    test('has the product title', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page).toHaveTitle('SETPOINT · Beach Tennis');
    });
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const [name, path] of [
    ['setup', '/'],
    ['dashboard sign-in', '/dashboard'],
  ] as const) {
    test(`nothing animates or transitions on the ${name}, pseudo-elements included`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const moving = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const element of Array.from(document.querySelectorAll('*'))) {
          for (const pseudo of [null, '::before', '::after']) {
            const style = getComputedStyle(element, pseudo);
            const animated = style.animationName !== 'none' && style.animationDuration !== '0s';
            const transitioned = style.transitionDuration.split(',').some((duration) => duration.trim() !== '0s');
            if (animated || transitioned)
              offenders.push(`${element.tagName.toLowerCase()}.${element.className}${pseudo ?? ''}`);
          }
        }
        return offenders;
      });
      expect(moving).toEqual([]);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
    });
  }
});
