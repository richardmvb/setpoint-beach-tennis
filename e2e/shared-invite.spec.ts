import { expect, test } from './support/fixtures';
import { mockSupabase, tournamentFixture } from './support/supabase-mock';

/**
 * A shared tournament is joined from an invite link (?invite=TOKEN today, /t/:token after Phase 4). The guest sees
 * the tournament through `get_shared_tournament`, joins with `join_shared_tournament`, and then follows it live.
 */

const TOKEN = 'invite-token-abc';

const registrationState = (players: { id: string; name: string }[]) => ({
  ...tournamentFixture(),
  hostingMode: 'shared',
  sharedStatus: 'registration',
  players,
  rounds: [],
  startedAt: undefined,
});

const snapshot = (players: { id: string; name: string }[], canJoin = true) => ({
  id: 'shared-1',
  status: 'registration',
  capacity: 8,
  state: registrationState(players),
  inviteExpiresAt: '2099-01-01T00:00:00Z',
  expiresAt: null,
  canJoin,
});

test.describe('shared invite', () => {
  test('a guest opens the invite, enters a name and joins', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const host = [{ id: 'p1', name: 'Moderadora' }];
    supabase.rpc('get_shared_tournament', snapshot(host));
    supabase.rpc('join_shared_tournament', snapshot([...host, { id: 'p2', name: 'Convidado Teste' }]));

    await page.goto(`/?invite=${TOKEN}`);

    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Seu nome' }).fill('Convidado Teste');
    await page.getByRole('button', { name: 'Participar' }).click();

    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toHaveCount(0);
    await expect(page.getByText('Convidado Teste').first()).toBeVisible();
    const [join] = supabase.calls('join_shared_tournament');
    expect(join).toMatchObject({ p_invite_token: TOKEN, p_display_name: 'Convidado Teste' });
    expect(supabase.calls('get_shared_tournament')[0]).toEqual({ p_invite_token: TOKEN });
  });

  test('a guest who joined before comes back already joined', async ({ page }) => {
    const supabase = await mockSupabase(page);
    const players = [
      { id: 'p1', name: 'Moderadora' },
      { id: 'p2', name: 'Convidado Teste' },
    ];
    supabase.rpc('get_shared_tournament', snapshot(players));
    supabase.rpc('join_shared_tournament', snapshot(players));

    await page.goto(`/?invite=${TOKEN}`);
    await page.getByRole('textbox', { name: 'Seu nome' }).fill('Convidado Teste');
    await page.getByRole('button', { name: 'Participar' }).click();
    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toHaveCount(0);

    await page.reload();

    await expect(page.getByText('Convidado Teste').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Entre no torneio' })).toHaveCount(0);
  });

  for (const [code, message] of [
    ['invite_expired', 'Este convite expirou ou as inscrições foram encerradas.'],
    ['invalid_invite', 'Este link de convite não é válido.'],
  ] as const) {
    test(`an invite that fails with ${code} shows a clear message`, async ({ page }) => {
      const supabase = await mockSupabase(page);
      supabase.fail('get_shared_tournament', code);

      await page.goto(`/?invite=${TOKEN}`);

      await expect(page.getByRole('alert')).toHaveText(message);
    });
  }

  test('a full tournament tells the guest the spots are taken', async ({ page }) => {
    const supabase = await mockSupabase(page);
    supabase.rpc('get_shared_tournament', snapshot([{ id: 'p1', name: 'Moderadora' }]));
    supabase.fail('join_shared_tournament', 'tournament_full');

    await page.goto(`/?invite=${TOKEN}`);
    await page.getByRole('textbox', { name: 'Seu nome' }).fill('Atrasado');
    await page.getByRole('button', { name: 'Participar' }).click();

    await expect(page.getByRole('alert')).toHaveText('As vagas deste torneio já foram preenchidas.');
  });
});
