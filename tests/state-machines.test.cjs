const assert = require('node:assert/strict');
const test = require('node:test');
const { loadCore } = require('./helpers-ts.cjs');

const machines = loadCore('state-machines');
const round = { number: 1, matches: [], restingPlayerIds: [] };

test('a fase do torneio é derivada do estado, do cadastro ao encerramento', () => {
  const phase = machines.tournamentPhase;
  assert.equal(phase({ rounds: [], finals: null }), 'setup');
  assert.equal(phase({ rounds: [], hostingMode: 'shared', sharedStatus: 'registration' }), 'registration');
  assert.equal(phase({ rounds: [], hostingMode: 'shared', sharedStatus: 'ready' }), 'ready');
  assert.equal(phase({ rounds: [round], hostingMode: 'shared', sharedStatus: 'active' }), 'qualifying');
  assert.equal(phase({ rounds: [round], finals: { matches: [], complete: false, podiumPlayerIds: [] } }), 'finals');
  assert.equal(
    phase({
      rounds: [round],
      finals: { matches: [], complete: true, podiumPlayerIds: [] },
      finishedAt: '2026-11-09T10:00:00Z',
    }),
    'finished',
  );
});

test('finalizado é terminal e nenhuma fase volta ao início', () => {
  const flow = machines.TOURNAMENT_PHASE_FLOW;
  assert.deepEqual(flow.finished, []);
  for (const [from, targets] of Object.entries(flow)) {
    assert.ok(!targets.includes('setup'), `${from} não volta para setup`);
    for (const target of targets) assert.ok(flow[target] !== undefined);
  }
  assert.ok(machines.canTransitionTournamentPhase('qualifying', 'finals'));
  assert.ok(!machines.canTransitionTournamentPhase('finished', 'finals'));
  assert.ok(machines.canTransitionTournamentPhase('finals', 'finals'));
  for (const label of Object.values(machines.TOURNAMENT_PHASE_LABEL)) assert.ok(label.length > 0);
});

test('o status de sincronização preserva a precedência e os textos originais', () => {
  const base = { available: true, error: false, online: true, paused: false, inFlight: false, hasPending: false };
  const check = (patch, status, label) => {
    const result = machines.syncStatus({ ...base, ...patch });
    assert.equal(result, status);
    assert.equal(machines.SYNC_STATUS_LABEL[result], label);
  };
  check({ available: false, error: true }, 'device-only', 'Salvo neste dispositivo');
  check({ error: true, online: false }, 'error', 'Sincronização pendente');
  check({ online: false, paused: true }, 'offline', 'Sem conexão');
  check({ paused: true, inFlight: true }, 'paused', 'Modo offline');
  check({ inFlight: true, hasPending: true }, 'syncing', 'Sincronizando');
  check({ hasPending: true }, 'pending', 'Aguardando sincronização');
  check({}, 'synced', 'Sincronizado');
});
