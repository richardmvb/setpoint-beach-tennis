import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, generateFinals, test } from './support/fixtures';

/** 24 players in 6 groups of 4, every group match scored, no finals yet (e2e/support/groups24.json). */
const groups24 = readFileSync(join(__dirname, 'support', 'groups24.json'), 'utf8');

test.describe('Grupos 24', () => {
  test('the finals take the top 8 of the overall ranking, come first, and fold the groups under them', async ({
    page,
  }) => {
    await page.addInitScript((state: string) => {
      if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', state);
    }, groups24);
    await page.goto('/');
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();

    // The groups only organize the matches: one list decides, with the cut after the 8th place.
    const race = page.getByRole('article', { name: 'Ranking geral' });
    await expect(race.getByText('LINHA DE CORTE · 8 VAGAS')).toBeVisible();
    await race.getByRole('button', { name: 'Ver todos (24)' }).click();
    const rows = await race.locator('tbody tr:not(.cut-line)').evaluateAll((trs) =>
      trs.map((tr) => ({
        name: tr.querySelector('.who-name')?.textContent?.trim() ?? '',
        wins: Number(tr.querySelector('td.col-num b')?.textContent),
      })),
    );
    expect(rows).toHaveLength(24);
    // Athletes tied across the cut are drawn when the finals are generated, so the order of the tied ones may change.
    // Whoever has more wins than the 9th place is surely in, and whoever has fewer wins than the 8th is surely out.
    const sure = rows.filter((row) => row.wins > rows[8].wins).map((row) => row.name);
    const out = rows.filter((row) => row.wins < rows[7].wins).map((row) => row.name);
    expect(sure.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: 'Oito classificados' })).toBeVisible();
    await generateFinals(page);

    // The finals hold 8 athletes: the sure ones, and none of the sure outs.
    const finals = page.getByRole('heading', { name: 'Finais', exact: true }).locator('xpath=ancestor::article');
    const text = await finals.innerText();
    const has = (name: string): boolean => new RegExp(`(^|\\W)${name}(\\W|$)`).test(text);
    for (const name of sure) expect(has(name), `${name} should be in the finals`).toBe(true);
    for (const name of out) expect(has(name), `${name} should not be in the finals`).toBe(false);
    expect(rows.filter((row) => has(row.name))).toHaveLength(8);

    // The finals come first; the group stage is one folded row under them, and it opens to the same board.
    const folded = page.getByText('Fase de grupos encerrada');
    await expect(folded).toBeVisible();
    await expect(page.getByText(/8 na final · .+ foi o 1º/)).toBeVisible();
    const finalsBox = await finals.boundingBox();
    const foldedBox = await folded.boundingBox();
    expect(finalsBox!.y).toBeLessThan(foldedBox!.y);
    await folded.click();
    await expect(page.getByRole('article', { name: 'Ranking geral' })).toBeVisible();
  });
});
