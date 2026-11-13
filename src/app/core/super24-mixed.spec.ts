import { describe, expect, it } from 'vitest';
import { Player } from './models';
import { seededRandom } from '../testing/seeded-random';
import { ScheduleService } from './schedule.service';

const women = [
  'TATI',
  'YASMIN',
  'THAIS',
  'GABI',
  'SARA',
  'RENATA',
  'MISS',
  'ANA THAIS',
  'DÉBORA',
  'BRENDA',
  'MARCELA',
  'ALINE',
];
const men = [
  'WILSON',
  'DANIEL',
  'SAMUEL',
  'ERIQUE',
  'GABRIEL',
  'LUIZ GONZAGA',
  'DOUGLAS',
  'MP',
  'MATHEUS',
  'LUCAS',
  'GUSTAVO',
  'RICHARD',
];
const players: Player[] = [
  ...women.map((name) => ({ id: name, name, gender: 'female' as const })),
  ...men.map((name) => ({ id: name, name, gender: 'male' as const })),
];

describe('super 24 mixed', () => {
  for (const courts of [3, 6]) {
    // Three full Super 24 draws: about 2 s alone, and several times that under coverage with every spec in parallel.
    it(`Super 24 misto: ${courts} quadras`, { timeout: 20_000 }, async (context) => {
      for (let iteration = 0; iteration < 3; iteration++) {
        const expectedRounds = courts === 3 ? 24 : 12;
        // Seeded: the draw searches a random space, so an unseeded run took anywhere from 1 s to over 5 s under load.
        const scheduler = new ScheduleService();
        scheduler.random = seededRandom(20261113 + courts * 10 + iteration);
        const rounds = scheduler.generate(players, 24, courts, expectedRounds, true);
        expect(rounds.length).toBe(expectedRounds);
        const played = new Map(players.map((player) => [player.id, 0]));
        const rested = new Map(players.map((player) => [player.id, 0]));
        const partners = new Map(players.map((player) => [player.id, new Set<string>()]));
        const opponents = new Set<string>();
        const groups = new Set<string>();
        for (const [index, round] of rounds.entries()) {
          expect(round.number).toBe(index + 1);
          expect(round.matches.length).toBe(courts);
          expect(round.restingPlayerIds.length).toBe(24 - courts * 4);
          const participants = new Set(round.restingPlayerIds);
          round.restingPlayerIds.forEach((id) => rested.set(id, rested.get(id)! + 1));
          for (const match of round.matches) {
            const group = [...match.teamA, ...match.teamB].sort();
            const groupKey = JSON.stringify(group);
            expect(new Set(group).size).toBe(4);
            expect(groups.has(groupKey), 'grupo de quatro repetido').toBe(false);
            groups.add(groupKey);
            for (const team of [match.teamA, match.teamB]) {
              expect(players.find((player) => player.id === team[0])!.gender).not.toBe(
                players.find((player) => player.id === team[1])!.gender,
              );
              expect(partners.get(team[0])!.has(team[1]), 'parceria repetida').toBe(false);
              partners.get(team[0])!.add(team[1]);
              partners.get(team[1])!.add(team[0]);
              team.forEach((id) => {
                expect(participants.has(id), 'jogador duplicado na rodada').toBe(false);
                participants.add(id);
                played.set(id, played.get(id)! + 1);
              });
            }
            for (const first of match.teamA)
              for (const second of match.teamB) {
                opponents.add(JSON.stringify([first, second].sort()));
              }
          }
          expect(participants.size).toBe(24);
        }
        expect(groups.size).toBe(72);
        for (const player of players) {
          expect(played.get(player.id)).toBe(12);
          expect(rested.get(player.id)).toBe(courts === 3 ? 12 : 0);
          expect(partners.get(player.id)!.size).toBe(12);
        }
        expect([...partners.get('RICHARD')!].sort()).toStrictEqual([...women].sort());
        await context.annotate(`execução ${iteration + 1}: ${opponents.size}/276 pares de adversários distintos`);
      }
    });
  }

  it('Super 8 mantém sete rodadas nos formatos aberto e misto', () => {
    const participants = [...players.slice(0, 4), ...players.slice(12, 16)];
    for (const mixed of [false, true]) {
      const rounds = new ScheduleService().generate(participants, 8, 2, 7, mixed);
      expect(rounds.length).toBe(7);
      expect(rounds.every((round) => round.matches.length === 2)).toBe(true);
    }
  });

  it('Super 24 misto exige categorias balanceadas e a quantidade correta de rodadas', () => {
    const scheduler = new ScheduleService();
    const unbalanced = players.map((player) => ({ ...player }));
    unbalanced[0].gender = 'male';
    expect(() => scheduler.generate(unbalanced, 24, 6, 12, true)).toThrow(/mesma quantidade/);
    expect(() => scheduler.generate(players, 24, 3, 46, true)).toThrow(/24 rodadas/);
    expect(() => scheduler.generate(players, 24, 6, 23, true)).toThrow(/12 rodadas/);
  });
});
