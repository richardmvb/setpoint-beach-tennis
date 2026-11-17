import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

/**
 * Partidas and Ranking: scoring, the finals, the tie draw and finishing the tournament, on states seeded in the
 * stored shape (tests/fixtures/persisted/tournament/v1.json: a Super 8 with 7 rounds and one match played).
 */

type Stored = {
  rounds: { matches: Record<string, unknown>[] }[];
  players: { id: string }[];
  finals?: unknown;
  finishedAt?: string;
};

const fixture = (): Stored =>
  JSON.parse(
    readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'persisted', 'tournament', 'v1.json'), 'utf8'),
  ) as Stored;

/** Every match of the schedule played: the winner has 4 games, the loser 0 to 3. */
function played(): Stored {
  const state = fixture();
  let index = 0;
  for (const round of state.rounds)
    for (const match of round.matches) Object.assign(match, { scoreA: 4, scoreB: index++ % 4 });
  return state;
}

/** Every match ends 4 to 4: nothing separates the eight players, so the tie draw is needed. */
function tied(): Stored {
  const state = fixture();
  for (const round of state.rounds) for (const match of round.matches) Object.assign(match, { scoreA: 4, scoreB: 4 });
  return state;
}

function finalMatch(kind: string, court: number, a: string[], b: string[], extra: object = {}) {
  return {
    id: `final-${kind}`,
    court,
    teamA: a,
    teamB: b,
    scoreA: null,
    scoreB: null,
    phase: 'final',
    finalKind: kind,
    tieBreakA: null,
    tieBreakB: null,
    ...extra,
  };
}

/** The group stage played and the finals generated; `scores` fills the championship and the third-place match. */
function withFinals(scores?: { champion: [number, number]; third: [number, number] }): Stored {
  const state = played();
  const p = state.players.map((player) => player.id);
  const champion = finalMatch('championship', 1, [p[0], p[2]], [p[1], p[3]]);
  const third = finalMatch('third-place', 2, [p[4], p[6]], [p[5], p[7]]);
  if (scores) {
    Object.assign(champion, { scoreA: scores.champion[0], scoreB: scores.champion[1] });
    Object.assign(third, { scoreA: scores.third[0], scoreB: scores.third[1] });
  }
  state.finals = {
    matches: [champion, third],
    complete: !!scores,
    podiumPlayerIds: scores ? [p[0], p[2], p[1], p[3], p[4], p[6], p[5], p[7]] : [],
  };
  return state;
}

async function start(page: Page, state: Stored, tab: RegExp): Promise<void> {
  await page.addInitScript((value: string) => {
    if (!localStorage.getItem('setpoint.tournament.v1')) localStorage.setItem('setpoint.tournament.v1', value);
  }, JSON.stringify(state));
  await page.goto('/');
  await page.getByRole('button', { name: tab }).first().click();
}

const stored = (page: Page): Promise<Stored> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('setpoint.tournament.v1') ?? '{}') as Stored);

test.describe('rounds', () => {
  test('a saved score can be removed after confirming, and Escape keeps it', async ({ page }) => {
    await start(page, fixture(), /Partidas/);
    await expect(page.getByText('Placar salvo')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpar' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Remover o placar desta partida?' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Placar salvo')).toHaveCount(1);

    await page.getByRole('button', { name: 'Limpar' }).click();
    await dialog.getByRole('button', { name: 'Remover placar' }).click();
    await expect(page.getByText('Placar salvo')).toHaveCount(0);
    await expect(page.getByText('Placar removido.')).toBeVisible();
    expect((await stored(page)).rounds[0].matches[0]).toMatchObject({ scoreA: null, scoreB: null });
  });

  test('the round you were on is kept when you leave Partidas and come back', async ({ page }) => {
    await start(page, played(), /Partidas/);
    await page.locator('.round-tabs button').nth(3).click();
    await expect(page.getByText('RODADA 4 DE 7')).toBeVisible();
    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Ranking individual' })).toBeVisible();
    await page
      .getByRole('button', { name: /Partidas/ })
      .first()
      .click();
    await expect(page.getByText('RODADA 4 DE 7')).toBeVisible();
    await expect(page.locator('.round-tabs button.active')).toContainText('4');
  });

  test('the round survives a trip to the landing page and back', async ({ page }) => {
    await start(page, played(), /Partidas/);
    await page.locator('.round-tabs button').nth(2).click();
    await page
      .getByRole('button', { name: /Ajustes/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Voltar para a página inicial' }).click();
    await page.getByRole('button', { name: 'Abrir o app' }).click();
    await page
      .getByRole('button', { name: /Partidas/ })
      .first()
      .click();
    await expect(page.getByText('RODADA 3 DE 7')).toBeVisible();
  });

  test('the rounds are locked once the finals exist', async ({ page }) => {
    await start(page, withFinals(), /Partidas/);
    await expect(page.getByText('Bloqueadas após as finais.')).toBeVisible();
    for (const field of await page.locator('input.inline-score').all()) await expect(field).toBeDisabled();
  });
});

test.describe('finals', () => {
  test('generates the finals from the ranking, with no tie to draw', async ({ page }) => {
    await start(page, played(), /Ranking/);
    await expect(page.getByRole('heading', { name: 'Oito classificados' })).toBeVisible();
    await page.getByRole('button', { name: 'Gerar finais' }).click();
    await expect(page.getByRole('heading', { name: 'Finais', exact: true })).toBeVisible();
    await expect(page.getByText('Finais geradas com base nos oito primeiros do ranking.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar finais' })).toHaveCount(0);
    const finals = (await stored(page)).finals as { matches: { finalKind: string }[] };
    expect(finals.matches.map((match) => match.finalKind)).toEqual(['championship', 'third-place']);
  });

  test('a tie the rules cannot split opens the draw; Escape cancels and focus returns to the button', async ({
    page,
  }) => {
    await start(page, tied(), /Ranking/);
    const generate = page.getByRole('button', { name: 'Gerar finais' });
    await generate.click();
    const dialog = page.getByRole('dialog', { name: /Empate entre/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Realizar sorteio' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(generate).toBeFocused();
    expect((await stored(page)).finals ?? null).toBeNull();
  });

  test('drawing the tie is saved with the tournament, and confirming generates the finals', async ({ page }) => {
    await start(page, tied(), /Ranking/);
    await page.getByRole('button', { name: 'Gerar finais' }).click();
    const dialog = page.getByRole('dialog', { name: /Empate entre/ });
    await dialog.getByRole('button', { name: 'Realizar sorteio' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(8);
    await expect(page.getByText('Sorteio registrado; a classificação foi atualizada.')).toBeVisible();
    const saved = (await stored(page)) as Stored & { tieBreakDraws: { playerIds: string[]; order: string[] }[] };
    expect(saved.tieBreakDraws).toHaveLength(1);
    expect(saved.tieBreakDraws[0].order).toHaveLength(8);
    // The draw is final: cancelling now keeps it, and asking again goes straight to the finals.
    await dialog.getByRole('button', { name: 'Confirmar e gerar finais' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Finais', exact: true })).toBeVisible();
  });

  test('a manual final records its games, and the tie-break appears at 6 to 6', async ({ page }) => {
    await start(page, withFinals(), /Ranking/);
    const games = page.getByRole('spinbutton', { name: /Games da dupla [12] na final/ });
    await games.nth(0).fill('6');
    await games.nth(1).fill('6');
    await expect(page.getByText('Tie-break: vencer por 2 pontos')).toBeVisible();
    await page.getByRole('spinbutton', { name: 'Pontos de tie-break da dupla 1' }).fill('7');
    await page.getByRole('spinbutton', { name: 'Pontos de tie-break da dupla 2' }).fill('5');
    await expect(page.getByText('Resultado salvo')).toBeVisible();
    await expect(page.getByText('● Registrado')).toBeVisible();
    const finals = (await stored(page)).finals as { matches: Record<string, unknown>[] };
    expect(finals.matches[0]).toMatchObject({ scoreA: 6, scoreB: 6, tieBreakA: 7, tieBreakB: 5 });
  });

  test('the championship can be scored point by point, undone, and switched back after confirming', async ({
    page,
  }) => {
    await start(page, withFinals(), /Ranking/);
    await page.getByRole('button', { name: 'Ativar ponto a ponto' }).click();
    await expect(page.getByText('PONTO A PONTO', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar ponto à dupla 1' }).click();
    await page.getByRole('button', { name: 'Adicionar ponto à dupla 1' }).click();
    await page.getByRole('button', { name: 'Adicionar ponto à dupla 2' }).click();
    let finals = (await stored(page)).finals as { matches: { livePoints?: string[] }[] };
    expect(finals.matches[0].livePoints).toEqual(['A', 'A', 'B']);
    await page.getByRole('button', { name: 'Desfazer último ponto' }).click();
    finals = (await stored(page)).finals as typeof finals;
    expect(finals.matches[0].livePoints).toEqual(['A', 'A']);

    await page.getByRole('button', { name: 'Usar placar manual' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Alterar o modo de placar?' });
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('PONTO A PONTO', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Usar placar manual' }).click();
    await dialog.getByRole('button', { name: 'Alterar e apagar' }).click();
    await expect(page.getByText('PONTO A PONTO', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('spinbutton', { name: 'Games da dupla 1 na final' }).first()).toBeVisible();
  });

  test('finishing the tournament needs the typed word, lands on Ajustes and locks the finals', async ({ page }) => {
    await start(page, withFinals({ champion: [6, 2], third: [6, 4] }), /Ranking/);
    await expect(page.getByText('PÓDIO FINAL')).toBeVisible();
    await page.getByRole('button', { name: 'Finalizar torneio' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Finalizar o torneio?' });
    await expect(confirm.getByRole('button', { name: 'Finalizar torneio' })).toBeDisabled();
    await confirm.getByRole('textbox').fill('finalizar');
    await confirm.getByRole('button', { name: 'Finalizar torneio' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Relatório final' })).toBeVisible();
    expect((await stored(page)).finishedAt).toBeTruthy();

    await page
      .getByRole('button', { name: /Ranking/ })
      .first()
      .click();
    await expect(page.getByText(/Duração do torneio:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalizar torneio' })).toHaveCount(0);
    for (const field of await page.locator('input.inline-score').all()) await expect(field).toBeDisabled();
  });

  test('declining the typed confirmation leaves the tournament open', async ({ page }) => {
    await start(page, withFinals({ champion: [6, 2], third: [6, 4] }), /Ranking/);
    await page.getByRole('button', { name: 'Finalizar torneio' }).click();
    await page
      .getByRole('alertdialog', { name: 'Finalizar o torneio?' })
      .getByRole('button', { name: 'Cancelar' })
      .click();
    await expect(page.getByRole('button', { name: 'Finalizar torneio' })).toBeVisible();
    expect((await stored(page)).finishedAt).toBeUndefined();
  });
});
