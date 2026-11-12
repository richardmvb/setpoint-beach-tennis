import { describe, it, expect } from 'vitest';
import type { Player, PlayerStanding, TournamentState } from './models';
import { QualificationService } from './qualification.service';
import { ScheduleService } from './schedule.service';
import type { RandomSource } from './schedule-shuffle';

const goals = [1, 2, 3] as const;

/** `projectPath` returns null only for an unknown athlete; a test that reaches it expects a projection. */
function must<T>(value: T | null): T {
  if (value === null) throw new Error('esperava uma projeção do caminho');
  return value;
}

const service = new QualificationService();
const projectPath = (...args: Parameters<QualificationService['projectPath']>) => must(service.projectPath(...args));

const names = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gui', 'Hana'];
const players: Player[] = names.map((name, i) => ({ id: `p${i}`, name }));
let seed = 5;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/** Small seeded generator so the schedule shuffle (Math.random by default) is the same on every run. */
function seededRandom(start: number): RandomSource {
  let state = start;
  return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function build(
  playedRounds: number,
  partial = 0,
  scheduleSeed = 11,
): { state: TournamentState; standings: PlayerStanding[] } {
  const schedule = new ScheduleService();
  schedule.random = seededRandom(scheduleSeed);
  const rounds = schedule.generate(players, 8, 2, 7, false);
  rounds.forEach((round, ri) =>
    round.matches.forEach((match, mi) => {
      const played = ri < playedRounds || (ri === playedRounds && mi < partial);
      if (played) {
        const aWins = random() < 0.5;
        const loser = Math.floor(random() * 4);
        match.scoreA = aWins ? 4 : loser;
        match.scoreB = aWins ? loser : 4;
      } else {
        match.scoreA = null;
        match.scoreB = null;
      }
    }),
  );
  const state: TournamentState = {
    version: 1,
    name: 't',
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players,
    rounds,
    createdAt: '',
    tournamentMode: 'super',
  };
  const rows: PlayerStanding[] = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    setsWon: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameBalance: 0,
    rests: 0,
    matchesPlayed: 0,
  }));
  const by = new Map<string, PlayerStanding>(rows.map((r) => [r.playerId, r] as const));
  const rowOf = (id: string): PlayerStanding => {
    const row = by.get(id);
    if (!row) throw new Error(`jogador desconhecido: ${id}`);
    return row;
  };
  for (const r of rounds)
    for (const m of r.matches) {
      if (m.scoreA === null || m.scoreB === null) continue;
      for (const id of m.teamA) {
        const x = rowOf(id);
        x.gamesFor += m.scoreA;
        x.gamesAgainst += m.scoreB;
        if (m.scoreA > m.scoreB) x.setsWon++;
      }
      for (const id of m.teamB) {
        const x = rowOf(id);
        x.gamesFor += m.scoreB;
        x.gamesAgainst += m.scoreA;
        if (m.scoreB > m.scoreA) x.setsWon++;
      }
    }
  rows.forEach((r) => {
    r.gameBalance = r.gamesFor - r.gamesAgainst;
  });
  rows.sort((a, b) => b.setsWon - a.setsWon || b.gameBalance - a.gameBalance || a.name.localeCompare(b.name));
  return { state, standings: rows };
}

describe('qualification.service', () => {
  it('o resultado é guardado por jogos disputados e muda com resultados assumidos', () => {
    const { state, standings } = build(3);
    const first = projectPath(state, standings, 'p3');
    expect(projectPath(state, standings, 'p3'), 'mesma entrada, mesmo objeto').toBe(first);
    const open = state.rounds.flatMap((r) => r.matches).filter((m) => m.scoreA === null);
    const what = projectPath(state, standings, 'p3', { [open[0].id]: 'A' });
    expect(what).not.toBe(first);
    expect(what.forcedMatches.length).toBe(1);
    expect(what.openMatches).toBe(first.openMatches - 1);
    for (const g of goals) {
      expect(
        what.goals[g].myMatches.some((m) => m.id === open[0].id),
        'jogo assumido sai da lista',
      ).toBeFalsy();
      expect(what.goals[g].watchMatches.some((m) => m.id === open[0].id)).toBeFalsy();
    }
  });

  it('os jogos do atleta trazem o lado em que ele joga e a chance se vencer ou perder', () => {
    const { state, standings } = build(3);
    const path = projectPath(state, standings, 'p1');
    const open = state.rounds
      .flatMap((r) => r.matches)
      .filter((m) => m.scoreA === null && [...m.teamA, ...m.teamB].includes('p1'));
    const goal = path.goals[3];
    expect(goal.myMatches.length).toBe(open.length);
    for (const m of goal.myMatches) {
      expect(m.mySide === 'A' || m.mySide === 'B').toBeTruthy();
      const win = m.mySide === 'A' ? m.ifAWins : m.ifBWins;
      const loss = m.mySide === 'A' ? m.ifBWins : m.ifAWins;
      expect(win).toBeGreaterThanOrEqual(loss - 1e-9);
    }
    expect(goal.watchMatches.every((m) => !m.mine && m.swing >= 0.01)).toBeTruthy();
    expect(goal.rivals.length <= 3 && goal.rivals.every((r) => r.gainPerLoss > 0 && r.playerId !== 'p1')).toBeTruthy();
  });

  it('nenhum rival aparece com +0 pontos, qualquer que seja o sorteio das rodadas', () => {
    // Regression: a rival whose gain rounds to 0 points used to be listed as "+0 pts" for some schedules.
    for (let scheduleSeed = 1; scheduleSeed <= 40; scheduleSeed++) {
      const { state, standings } = build(3, 0, scheduleSeed);
      const path = projectPath(state, standings, 'p1');
      for (const goal of [1, 2, 3] as const) {
        for (const rival of path.goals[goal].rivals) {
          expect(
            rival.gainPerLoss,
            'sorteio ' + scheduleSeed + ', meta ' + goal + ': rival com +0 pts',
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('os textos seguem o estado: garantido, fora da disputa ou chance em porcentagem', () => {
    let alive = 0,
      clinched = 0,
      eliminated = 0;
    for (let trial = 0; trial < 25; trial++) {
      const { state, standings } = build(5);
      for (const p of players) {
        const path = projectPath(state, standings, p.id);
        for (const g of goals) {
          const goal = path.goals[g];
          if (goal.status === 'clinched') {
            clinched++;
            expect(goal.headline).toMatch(/garantido/i);
            expect(goal.probability).toBe(1);
          } else if (goal.status === 'eliminated') {
            eliminated++;
            expect(goal.headline).toMatch(/Fora/);
            expect(goal.detail).toMatch(/\dº/);
            expect(goal.probability).toBe(0);
          } else {
            alive++;
            expect(goal.headline).toMatch(/^(<1%|>99%|\d{1,2}%) de chance de (ser campeão|chegar ao top [23])$/);
          }
        }
      }
    }
    expect(alive && clinched && eliminated, 'cobrir os três estados').toBeTruthy();
  });

  it('o histórico reconstrói a chance rodada a rodada', () => {
    const { state, standings } = build(4, 1);
    const trend = service.pathHistory(state, 'p2');
    expect(trend.map((p) => p.label)).toStrictEqual(['Início', 'R1', 'R2', 'R3', 'R4', 'Agora']);
    for (const point of trend)
      for (const g of goals) expect(point.probability[g] >= 0 && point.probability[g] <= 1).toBeTruthy();
    const now = projectPath(state, standings, 'p2').goals[3].probability;
    expect(Math.abs(trend[trend.length - 1].probability[3] - now), 'o último ponto é a chance atual').toBeLessThan(
      0.03,
    );
    expect(service.pathHistory(state, 'p2'), 'cache').toBe(trend);
    const complete = build(3);
    expect(service.pathHistory(complete.state, 'p2').length, 'sem rodada parcial não há "Agora"').toBe(4);
  });

  it('formatação de chances nos extremos', () => {
    expect(service.formatChance(0)).toBe('0%');
    expect(service.formatChance(0.004)).toBe('<1%');
    expect(service.formatChance(0.994)).toBe('>99%');
    expect(service.formatChance(1)).toBe('100%');
    expect(service.formatChance(0.5)).toBe('50%');
  });
});
