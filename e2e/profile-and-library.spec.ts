import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { INDEX_KEY, seedTwoTournaments, STATE_PREFIX } from './support/library';
import { tournamentFixture } from './support/supabase-mock';

/**
 * The profile panel and "Meus torneios" are dialogs on the CDK (focus trap, Escape, click outside, focus back to
 * the opener). These tests keep what the hand-rolled modals did: the first-visit welcome, saving the profile, and
 * the way from the panel to the saved tournaments.
 */

const trigger = (page: Page) => page.getByRole('button', { name: /perfil/i });
const readProfile = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('setpoint.profile.v1') ?? 'null') as { name?: string } | null);

test.describe('first-visit welcome', () => {
  test.use({ onboarding: { skipLanding: true, disableTour: true, skipProfilePrompt: false } });

  test('opens once, with the intro text, and is not shown again after "Agora não"', async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: 'Quem é você?' });
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText('BEM-VINDO AO SETPOINT');
    await expect(welcome.getByText(/Conte quem você é/)).toBeVisible();
    await expect(page.locator('#profileName')).toBeFocused();
    await expect(welcome.getByText('MEUS TORNEIOS')).toHaveCount(0);

    await welcome.getByRole('button', { name: 'Agora não' }).click();
    await expect(welcome).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Configure a competição' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('saving a name shows it in the top bar and in the profile', async ({ page }) => {
    await page.goto('/');
    // The dialog is named by its title, which follows the typed name.
    const welcome = page.getByRole('dialog');
    await page.locator('#profileName').fill('  Ana Souza ');
    await expect(welcome.getByRole('heading', { name: 'Ana Souza' })).toBeVisible();
    await welcome.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(welcome).toHaveCount(0);

    expect((await readProfile(page))?.name).toBe('Ana Souza');
    await expect(page.getByRole('button', { name: /Perfil de Ana Souza/ })).toContainText('Ana');
    await trigger(page).click();
    await expect(page.getByRole('dialog', { name: 'Ana Souza' })).toBeVisible();
  });

  test('closing with Escape still saves the typed name', async ({ page }) => {
    await page.goto('/');
    await page.locator('#profileName').fill('Bia');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await readProfile(page))?.name).toBe('Bia');
  });
});

test.describe('first-visit welcome before the saved tournaments', () => {
  test.use({ onboarding: { skipLanding: false, disableTour: true, skipProfilePrompt: false } });

  test('"Retomar um torneio" shows the welcome first, then the list', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Retomar um torneio' }).first().click();
    const welcome = page.getByRole('dialog', { name: 'Quem é você?' });
    await expect(welcome).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Meus torneios' })).toHaveCount(0);
    await welcome.getByRole('button', { name: 'Agora não' }).click();
    await expect(page.getByRole('dialog', { name: 'Meus torneios' })).toBeVisible();
  });
});

test.describe('first-visit welcome and the setup tour', () => {
  test.use({ onboarding: { skipLanding: true, disableTour: false, skipProfilePrompt: false } });

  test('the tour waits for the welcome to close', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'Quem é você?' })).toBeVisible();
    await expect(page.locator('.driver-popover')).toHaveCount(0);
    await page.getByRole('button', { name: 'Agora não' }).click();
    await expect(page.locator('.driver-popover')).toBeVisible();
  });
});

test.describe('profile panel', () => {
  test('Escape closes it and focus goes back to the top bar button', async ({ page }) => {
    await page.goto('/');
    await trigger(page).click();
    const panel = page.getByRole('dialog', { name: 'Quem é você?' });
    await expect(panel).toBeVisible();
    // While a modal dialog is open the page behind it is out of the accessibility tree, so find the button by class.
    await expect(page.locator('.profile-trigger')).toHaveAttribute('aria-controls', 'profilePanel');
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.locator('.profile-trigger')).toBeFocused();
  });

  test('a click outside closes it and keeps the typed name', async ({ page }) => {
    await page.goto('/');
    await trigger(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#profileName').fill('Duda');
    await page.mouse.click(8, 500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await readProfile(page))?.name).toBe('Duda');
  });

  test('keeps the focus inside while it is open', async ({ page }) => {
    await page.goto('/');
    await trigger(page).click();
    const panel = page.getByRole('dialog');
    for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
    expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  });

  test('the auto-join choice and the category are saved on this device', async ({ page }) => {
    await page.goto('/');
    await trigger(page).click();
    await page.locator('#profileName').fill('Caio');
    // The compact category toggle shows no words, so pick the first (male) option by position.
    await page.getByRole('radiogroup', { name: 'Sua categoria' }).getByRole('radio').first().click();
    // The switch input is invisible; its label is what a person taps.
    await page.getByText('Entrar como jogador nos novos torneios').click();
    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('setpoint.profile.v1') ?? 'null') as Record<string, unknown>,
    );
    expect(stored).toMatchObject({ name: 'Caio', gender: 'male', autoJoin: false });
  });

  test('shows the latest saved tournaments and goes on to all of them', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await trigger(page).click();
    const panel = page.getByRole('dialog', { name: 'Quem é você?' });
    await expect(panel.getByRole('listitem')).toHaveCount(2);
    await expect(panel.getByRole('listitem').filter({ hasText: 'Fixture v1' })).toContainText('Em uso');

    await panel.getByRole('button', { name: 'Ver todos (2)' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Meus torneios' })).toBeVisible();
  });

  test('a recent tournament opens straight from the panel', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await trigger(page).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Torneio antigo/ })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (JSON.parse(localStorage.getItem('setpoint.tournament.v1') ?? '{}') as { name?: string }).name,
        ),
      )
      .toBe('Torneio antigo');
  });
});

test.describe('Meus torneios dialog', () => {
  test('Escape and a click outside close it, and focus goes back', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await page.getByRole('button', { name: /perfil/i }).click();
    await page.getByRole('button', { name: /Ver todos/ }).click();
    const library = page.getByRole('dialog', { name: 'Meus torneios' });
    await expect(library).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(library).toHaveCount(0);

    await page.getByRole('button', { name: /perfil/i }).click();
    await page.getByRole('button', { name: /Ver todos/ }).click();
    await expect(library).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(library).toHaveCount(0);
  });

  test('declining to discard an unsaved setup keeps the list open', async ({ page }) => {
    // A setup with players but no schedule is not in the library, so opening another tournament asks first.
    await page.addInitScript(
      ({ active, indexKey, statePrefix }) => {
        if (localStorage.getItem('setpoint.tournament.v1')) return;
        const unsaved = { ...active, rounds: [], startedAt: undefined, finals: undefined, name: 'Montagem' };
        localStorage.setItem('setpoint.tournament.v1', JSON.stringify(unsaved));
        localStorage.setItem(
          statePrefix + 'older-id',
          JSON.stringify({ ...active, name: 'Torneio antigo', analyticsId: 'older-id' }),
        );
        localStorage.setItem(
          indexKey,
          JSON.stringify({
            version: 1,
            entries: [
              {
                id: 'older-id',
                name: 'Torneio antigo',
                mode: 'super',
                hosting: 'local',
                size: 8,
                playerCount: 8,
                phase: 'qualifying',
                matchesCompleted: 3,
                matchesTotal: 28,
                createdAt: '2026-01-01T10:00:00.000Z',
                updatedAt: '2026-01-01T12:00:00.000Z',
                archivePending: false,
              },
            ],
          }),
        );
      },
      { active: tournamentFixture(), indexKey: INDEX_KEY, statePrefix: STATE_PREFIX },
    );
    await page.goto('/');
    await page.getByRole('button', { name: /perfil/i }).click();
    await page.getByRole('button', { name: /Ver todos/ }).click();
    const library = page.getByRole('dialog', { name: 'Meus torneios' });
    await library.getByRole('button', { name: 'Abrir' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Abrir outro torneio?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(library).toBeVisible();

    await library.getByRole('button', { name: 'Abrir' }).click();
    await page.getByRole('button', { name: 'Abrir e descartar' }).click();
    await expect(library).toHaveCount(0);
  });

  test('says inside the list why the tournament in use cannot be deleted', async ({ page }) => {
    await seedTwoTournaments(page);
    await page.goto('/');
    await page.getByRole('button', { name: /perfil/i }).click();
    await page.getByRole('button', { name: /Ver todos/ }).click();
    const library = page.getByRole('dialog', { name: 'Meus torneios' });
    await library.getByRole('button', { name: 'Excluir Fixture v1' }).click();
    await expect(library.getByRole('alert')).toHaveText('Este é o torneio em uso. Inicie outro antes de excluí-lo.');
  });
});
