import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, generateFinals, test } from './support/fixtures';

const fixture = (name: string): string => readFileSync(join(__dirname, 'support', name), 'utf8');

/** 4 pairs: Ana+Bia win all three matches, Caio+Duda two, Edu+Fabi one, Gui+Hana none. */
const pairs8 = fixture('pairs8.json');
/** The same 4 pairs where every match ends 6-3 to side A, so several pairs tie on everything. */
const pairs8Tied = fixture('pairs8-tied.json');

type Stored = { finals?: { matches: { finalKind: string; teamA: string[]; teamB: string[] }[] } };
const stored = (page: Page): Promise<Stored> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('setpoint.tournament.v1') ?? '{}') as Stored);

async function openRanking(page: Page, state: string): Promise<void> {
  await page.addInitScript((value: string) => {
    if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
  }, state);
  await page.goto('/');
  await page
    .getByRole('button', { name: /Ranking/ })
    .first()
    .click();
}

test.describe('fixed pairs stay together to the end', () => {
  test('the finals are between the best pairs, with nothing to draw when the pairs rank cleanly', async ({ page }) => {
    await openRanking(page, pairs8);
    // The ranking is of pairs, and the finals say so.
    await expect(page.getByRole('heading', { name: 'Quatro duplas classificadas' })).toBeVisible();
    await expect(page.getByText(/A 1ª dupla enfrenta a 2ª pelo título/)).toBeVisible();
    await expect(page.getByRole('article', { name: 'Ranking de duplas' })).toBeVisible();

    await page.getByRole('button', { name: 'Gerar finais' }).click();
    // Partners are never drawn against each other, and these pairs have nothing to draw.
    await expect(page.getByRole('heading', { name: 'Finais', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /Empate/ })).toHaveCount(0);

    // Ana+Bia (p1, p2) meet Caio+Duda (p3, p4) for the title, and Edu+Fabi (p5, p6) meet Gui+Hana (p7, p8).
    const { finals } = await stored(page);
    expect(finals!.matches).toHaveLength(2);
    const [final, third] = finals!.matches;
    expect(final).toMatchObject({ finalKind: 'championship', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] });
    expect(third).toMatchObject({ finalKind: 'third-place', teamA: ['p5', 'p6'], teamB: ['p7', 'p8'] });
    await expect(page.getByText('Fase de grupos encerrada')).toBeVisible();
    await expect(page.getByText(/4 na final · Ana \+ Bia foi o 1º/)).toBeVisible();
  });

  test('tied pairs are drawn as pairs, and the finals still hold whole pairs', async ({ page }) => {
    await openRanking(page, pairs8Tied);
    // All four pairs are inside the cut (nothing is marked on the list), but their order is still to be drawn.
    await page.getByRole('button', { name: 'Gerar finais' }).click();
    const dialog = page.getByRole('dialog', { name: /Empate de duplas/ });
    await expect(dialog).toBeVisible();
    // Each competitor is a pair named after both partners; nobody is drawn against their own partner.
    const first = dialog.locator('.tie-draw-list li');
    await expect(first.first()).toContainText(' + ');
    expect(await first.count()).toBeGreaterThan(1);
    await dialog.getByRole('button', { name: 'Realizar sorteio' }).click();
    await generateFinals(page);

    const { finals } = await stored(page);
    const pairs = [
      ['p1', 'p2'],
      ['p3', 'p4'],
      ['p5', 'p6'],
      ['p7', 'p8'],
    ];
    for (const match of finals!.matches)
      for (const team of [match.teamA, match.teamB]) expect(pairs).toContainEqual(team);
    // All four pairs play: each of the 8 athletes is in exactly one of the two matches.
    const everybody = finals!.matches.flatMap((match) => [...match.teamA, ...match.teamB]);
    expect(new Set(everybody)).toEqual(new Set(pairs.flat()));
  });
});
