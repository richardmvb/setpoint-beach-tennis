import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

/**
 * The 20-player format: groups of 4 or 5, the top two of each group plus the best third places (12 athletes), six
 * pairs, and a bracket with byes. Each test goes from the wizard to the podium, the way an organizer would.
 */

const NAMES = Array.from({ length: 20 }, (_, index) => `Atleta ${String(index + 1).padStart(2, '0')}`);

/** The new screens start clean: no axe violation (the a11y baseline stays empty for them). */
async function expectAccessible(page: Page, include?: string): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const results = await (include ? axe.include(include) : axe).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
}

async function createTournament(
  page: Page,
  groupSize: 4 | 5,
  pairing: 'crossed' | 'seededDraw',
  courtsIndex?: number,
): Promise<void> {
  await page.goto('/');
  await page.locator('#setupName').fill('Grupos 20');
  await page
    .locator('#tournamentMode')
    .getByRole('radio', { name: /^Grupos/ })
    .click();
  // The size slider lists 8, 12, 20 and 24: index 2 is 20.
  await page.locator('#setupSize').fill('2');
  await expect(page.locator('#setupSummary')).toContainText('Grupos 20');

  await page.getByRole('radio', { name: groupSize === 4 ? /5 grupos de 4/ : /4 grupos de 5/ }).click();
  await page.getByRole('radio', { name: pairing === 'crossed' ? /^Cruzado/ : /^Sorteio com cabeças/ }).click();
  await expect(page.locator('#setupSummary')).toContainText(groupSize === 4 ? '3' : '5');

  // The courts slider lists them in ascending order: 2, 3, 4 and so on.
  if (courtsIndex !== undefined) await page.locator('#setupCourts').fill(String(courtsIndex));
  await expectAccessible(page);
  await page.getByRole('button', { name: /Adicionar jogadores/ }).click();
  await page.locator('.batch-entry-button').click();
  await page.locator('textarea[name=batchPlayers]').fill(NAMES.join('\n'));
  await page.getByRole('button', { name: 'Gerar prévia' }).click();
  await page.getByRole('button', { name: /Adicionar 20 participante/ }).click();
  await page.getByRole('button', { name: /Revisar torneio/ }).click();
  await expect(page.locator('#reviewSummary')).toContainText('Grupos · 12 classificados');
  await page.getByRole('button', { name: /Gerar tabela/ }).click();
  await expect(page.getByRole('heading', { name: 'Partidas', exact: true })).toBeVisible();
}

/** Plays every round: side A wins 4 games (the game target) to `loserGames(match)`; the number of games of the loser varies the table. */
async function playGroupStage(page: Page, rounds: number, loserGames: (match: number) => number): Promise<void> {
  let match = 0;
  for (let round = 0; round < rounds; round++) {
    await page.locator('.round-tabs button').nth(round).click();
    const inputs = page.locator('input.inline-score');
    const count = await inputs.count();
    for (let index = 0; index < count; index += 2) {
      await inputs.nth(index).fill('4');
      await inputs.nth(index + 1).fill(String(loserGames(match++)));
    }
  }
}

/** Generates the finals, drawing every tie the dialog asks for. Returns how many draws were needed. */
async function generateFinals(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'Gerar finais' }).click();
  const dialog = page.getByRole('dialog', { name: /Empate/ });
  const finals = page.getByRole('heading', { name: 'Finais', exact: true });
  let draws = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await finals.isVisible()) break;
    if (await dialog.isVisible()) {
      await expect(dialog).toContainText(/Empate (no Grupo|entre terceiros|na ordem)/);
      await dialog.getByRole('button', { name: 'Realizar sorteio' }).click();
      if (draws === 0) await expectAccessible(page, '[role=dialog]');
      await dialog.getByRole('button', { name: /^Confirmar/ }).click();
      draws++;
    } else {
      await page.waitForTimeout(100);
    }
  }
  await expect(finals).toBeVisible();
  return draws;
}

/** Plays the bracket in order; each match is won by pair 1, and a match opens once both pairs are known. */
async function playBracket(page: Page): Promise<void> {
  for (let match = 0; match < 6; match++) {
    const games = page.getByRole('spinbutton', { name: /Games da dupla [12] na final/ });
    await expect(games.nth(match * 2)).toBeEnabled();
    await games.nth(match * 2).fill('6');
    await games.nth(match * 2 + 1).fill('3');
    await expect(page.getByText('● Registrado')).toHaveCount(match + 1);
  }
}

type Stored = { finals?: { matches: { id: string; teamA: string[]; teamB: string[] }[]; podiumPlayerIds: string[] } };
const stored = (page: Page): Promise<Stored> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('setpoint.tournament.v1') ?? '{}') as Stored);

test.describe('Grupos 20', () => {
  test('5 groups of 4 with crossed pairs: from the wizard to the podium', async ({ page }) => {
    await createTournament(page, 4, 'crossed');
    await expect(page.locator('.round-tabs button')).toHaveCount(3);
    await playGroupStage(page, 3, (match) => match % 4);

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Doze classificados' })).toBeVisible();
    await expect(page.getByText(/Duplas cruzadas pelo ranking/)).toBeVisible();
    // Header, the 12 that go on, the dashed cut line and the first one out.
    const race = page.getByRole('article', { name: 'Corrida para a final' });
    await expect(race.getByRole('row')).toHaveCount(15);
    await expect(race.getByText('LINHA DE CORTE · 12 VAGAS')).toBeVisible();
    await expect(page.getByText(/Classificado ·.*Melhor 3º ·.*Eliminado/)).toBeVisible();
    await expectAccessible(page);

    // Resumo is one tap away: the counts, the groups as folding rows. The choice survives a reload.
    await page.getByRole('button', { name: 'Resumo' }).click();
    await expect(page.getByRole('heading', { name: 'Quem vai para a final' })).toBeVisible();
    await expect(page.getByText('15 de 15 jogos')).toBeVisible();
    await expectAccessible(page);
    await page.reload();
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Resumo' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Compacto' }).click();
    await expect(page.getByRole('heading', { name: 'Corrida para a final' })).toBeVisible();

    // An athlete of a group card opens the athlete with the place in the race to the final.
    await page.getByRole('region', { name: 'Grupos' }).locator('button.ranking-player-button').first().click();
    const athlete = page.getByRole('dialog', { name: /./ });
    await expect(athlete.getByText(/º na corrida para a final/)).toBeVisible();
    await expect(athlete.getByText(/12 vagas na final/)).toBeVisible();
    await athlete.getByRole('button', { name: 'Fechar' }).click();
    await expect(athlete).toHaveCount(0);

    await generateFinals(page);
    const { finals } = await stored(page);
    expect(finals!.matches.map((match) => match.id)).toEqual([
      'final-qfb-1',
      'final-qfb-2',
      'final-sf-1',
      'final-sf-2',
      'final-championship',
      'final-third-place',
    ]);
    // D1 and D2 wait in the semifinals: their opponent is "a definir" until the quarterfinals are played.
    expect(finals!.matches[2].teamB).toEqual(['', '']);
    await expect(page.getByText('A definir').first()).toBeVisible();
    // Scores are typed under Jogos (the default); the tree is a view of the same finals.
    await expect(page.getByRole('region', { name: 'Chave da fase final' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chave', exact: true }).click();
    const bracket = page.getByRole('region', { name: 'Chave da fase final' });
    await expect(bracket).toBeVisible();
    await expect(bracket.getByText('BYE', { exact: true })).toHaveCount(2);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Jogos', exact: true }).click();

    await playBracket(page);
    await expect(page.getByText('Pódio').first()).toBeVisible();
    expect((await stored(page)).finals!.podiumPlayerIds).toHaveLength(8);
  });

  test('4 groups of 5 with a seeded draw: every tie is drawn, then to the podium', async ({ page }) => {
    await createTournament(page, 5, 'seededDraw');
    await expect(page.locator('.round-tabs button')).toHaveCount(5);
    // Everything ends 4-2 for side A: groups and the thirds are full of ties, so the draw is asked for.
    await playGroupStage(page, 5, () => 2);

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByText(/Cada uma das 6 melhores sorteia o parceiro/)).toBeVisible();
    expect(await generateFinals(page)).toBeGreaterThan(0);
    const { finals } = await stored(page);
    expect(finals!.matches).toHaveLength(6);

    await playBracket(page);
    expect((await stored(page)).finals!.podiumPlayerIds).toHaveLength(8);
  });

  test('the pairing can be changed in Ajustes until the finals exist', async ({ page }) => {
    await createTournament(page, 4, 'crossed');
    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    const pairing = page.getByLabel('Duplas da fase final');
    await expect(pairing).toBeEnabled();
    await expect(page.getByLabel('Grupos', { exact: true })).toBeDisabled();
    await pairing.selectOption({ label: 'Sorteio com cabeças de chave' });
    await expect(page.getByText(/Sorteio com cabeças de chave: cada um dos 6 melhores/)).toBeVisible();
    await page.reload();
    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    await expect(page.getByLabel('Duplas da fase final')).toHaveValue('1: seededDraw');
    await expectAccessible(page);
  });

  test('with fewer courts than groups every match is in one open list, and no qualification mark shows early', async ({
    page,
  }) => {
    await createTournament(page, 4, 'crossed', 1);
    await expect(page.getByText(/QUADRA \d/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Todos os jogos' }).click();
    await expect(page.getByRole('heading', { name: '15 jogos' })).toBeVisible();
    await page.getByLabel('Grupo', { exact: true }).selectOption({ label: 'Grupo B' });
    await expect(page.getByRole('heading', { name: '3 jogos' })).toBeVisible();
    await page.getByLabel('Grupo', { exact: true }).selectOption({ label: 'Todos os grupos' });
    await page.getByRole('checkbox', { name: 'Só pendentes' }).check();

    const inputs = page.locator('input.inline-score');
    await inputs.nth(0).fill('4');
    await inputs.nth(1).fill('2');
    await expect(page.getByRole('heading', { name: '14 jogos' })).toBeVisible();

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Corrida para a final' })).toBeVisible();
    await expect(page.getByText('Ordem provisória')).toBeVisible();
    await expect(page.getByText('Eliminado')).toHaveCount(0);
    await expect(page.getByText('Melhor 3º')).toHaveCount(0);
    await expectAccessible(page);
  });
});
