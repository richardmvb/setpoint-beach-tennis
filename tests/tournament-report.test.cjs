const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { FAKE_SUPABASE_SQL } = require('./support/fake-supabase.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/app/core/tournament-report.service.ts'), 'utf8');
const javascript = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
    experimentalDecorators: true,
  },
}).outputText;
const reportExports = {};
new Function('require', 'exports', javascript)(
  (name) => (name === '@angular/core' ? { Injectable: () => (target) => target } : require(name)),
  reportExports,
);

const players = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
  { id: 'd', name: 'Dani' },
];
const match = (id, scoreA, scoreB, extra = {}) => ({
  id,
  court: 1,
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoreA,
  scoreB,
  ...extra,
});
const base = {
  version: 1,
  name: 'Torneio de teste',
  size: 8,
  courts: 2,
  gamesToWin: 4,
  roundCount: 7,
  createdAt: '2026-11-08T10:00:00Z',
  finishedAt: '2026-11-08T12:00:00Z',
  players,
  tournamentMode: 'super',
  doublesFormat: 'open',
  groups: [],
  rounds: [],
  finals: null,
};

test('relatório de finais antecipadas inclui só jogos realizados, finais e tie-break', () => {
  const service = new reportExports.TournamentReportService();
  const state = {
    ...base,
    earlyFinalsEnabled: true,
    rounds: [
      { number: 1, matches: [match('played', 4, 2), match('unplayed', null, null)], restingPlayerIds: [] },
      { number: 2, matches: [match('unplayed-round', null, null)], restingPlayerIds: [] },
    ],
    finals: {
      complete: true,
      podiumPlayerIds: [],
      matches: [
        match('final', 7, 6, { finalKind: 'championship', tieBreakA: 8, tieBreakB: 6 }),
        match('third', 6, 3, { finalKind: 'third-place' }),
      ],
    },
  };
  const report = service.build(state);
  assert.deepEqual(
    report.sections.map((section) => section.title),
    ['Rodada 1', 'Fase final'],
  );
  assert.equal(report.sections.flatMap((section) => section.matches).length, 3);
  const text = service.toText(report);
  assert.match(text, /Ana \+ Bia 4 × 2 Caio \+ Dani/);
  assert.match(text, /Final · Quadra 1/);
  assert.match(text, /Tie-break 8–6/);
  assert.match(text, /Disputa de 3º lugar/);
  assert.doesNotMatch(text, /RODADA 2|pendente/i);
});

test('relatório de grupos identifica quadras e mantém placares pendentes fora das finais antecipadas', () => {
  const service = new reportExports.TournamentReportService();
  const state = {
    ...base,
    tournamentMode: 'groups',
    doublesFormat: 'mixed',
    groups: [{ id: 'group-a', name: 'Grupo A', playerIds: ['a', 'b', 'c', 'd'] }],
    rounds: [
      {
        number: 1,
        matches: [match('group-match', null, null, { groupId: 'group-a', court: 2 })],
        restingPlayerIds: [],
      },
    ],
  };
  const report = service.build(state);
  assert.equal(report.format, 'Grupos 8 · duplas mistas');
  assert.match(service.toText(report), /Grupo A · Quadra 2/);
  assert.match(service.toText(report), /pendente/);
  assert.throws(() => service.build({ ...state, finishedAt: undefined }), /Finalize/);
});

test('PNG contém todos os jogos e limita dimensões em relatórios grandes', async () => {
  const calls = [];
  const context = {
    font: '',
    fillStyle: '',
    textBaseline: '',
    textAlign: '',
    measureText: (text) => ({ width: [...text].length * 12 }),
    setTransform: () => {},
    fillRect: () => {},
    fillText: (text) => calls.push(text),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback) => callback(new Blob(['png'], { type: 'image/png' })),
  };
  const oldDocument = global.document;
  global.document = { fonts: { ready: Promise.resolve() }, createElement: () => canvas };
  try {
    const longNameA = 'A'.repeat(40);
    const longNameB = 'B'.repeat(40);
    const report = {
      name: 'Torneio longo',
      format: 'Super 24 · duplas abertas',
      finishedAt: base.finishedAt,
      sections: Array.from({ length: 23 }, (_, index) => ({
        title: `Rodada ${index + 1}`,
        matches: Array.from({ length: 6 }, (_, court) => ({
          label: `Quadra ${court + 1}`,
          teamA: `${longNameA} + ${longNameB}`,
          teamB: 'Caio + Dani',
          scoreA: '4',
          scoreB: '2',
          tieBreak: '',
          pending: false,
        })),
      })),
    };
    const blob = await new reportExports.TournamentReportService().toImage(report);
    assert.equal(blob.type, 'image/png');
    assert.ok(canvas.width >= 700 && canvas.width <= 1200);
    assert.ok(canvas.height <= 16384);
    assert.ok(canvas.width * canvas.height <= 14_100_000);
    assert.equal(calls.filter((value) => value === 'Caio + Dani').length, 138);
    assert.equal(calls.filter((value) => value.includes(longNameA)).length, 138);
    assert.equal(calls.filter((value) => value.includes(longNameB)).length, 138);
  } finally {
    global.document = oldDocument;
  }
});

test('link final aponta para snapshot concluído, somente leitura para visitantes', async () => {
  const database = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  try {
    await database.exec(`
      ${FAKE_SUPABASE_SQL}
      create sequence extensions.token_sequence;
      create function extensions.gen_random_bytes(integer) returns bytea language sql as $$
        select decode(lpad(to_hex(nextval('extensions.token_sequence')), $1 * 2, '0'), 'hex')
      $$;
      create function extensions.digest(text, text) returns bytea language sql immutable as $$ select convert_to($1, 'UTF8') $$;
      create table public.shared_tournaments (id uuid primary key, owner_id uuid, status text, state jsonb, capacity integer, invite_expires_at timestamptz, expires_at timestamptz, updated_at timestamptz);
    `);
    await database.query('insert into auth.users values ($1)', [owner]);
    const migrations = path.join(__dirname, '../supabase/migrations');
    await database.exec(fs.readFileSync(path.join(migrations, '202611070002_local_live_spectator_links.sql'), 'utf8'));
    await database.exec(fs.readFileSync(path.join(migrations, '202611080002_offline_sync.sql'), 'utf8'));
    await database.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false)`);
    const created = (await database.query('select public.create_local_live_tournament($1) as value', [base])).rows[0]
      .value;
    assert.equal(created.readToken.length, 64);
    assert.notEqual(created.readToken, created.writeToken);
    const changed = { ...base, name: 'Alterado' };
    await assert.rejects(
      database.query('select public.sync_local_live_tournament($1,$2,$3)', [created.writeToken, base, changed]),
      /tournament_completed/,
    );
    await database.exec('reset role; set role anon');
    const snapshot = (await database.query('select public.get_local_live_tournament($1) as value', [created.readToken]))
      .rows[0].value;
    assert.equal(snapshot.status, 'completed');
    assert.equal(snapshot.state.name, base.name);
    await assert.rejects(
      database.query('select public.update_local_live_tournament($1,$2)', [created.readToken, changed]),
      /permission denied/,
    );
  } finally {
    await database.close();
  }
});
