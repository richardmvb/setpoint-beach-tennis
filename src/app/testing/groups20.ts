import type { GroupSize, Match, TournamentState } from '../core/models';
import { GroupScheduleService } from '../core/group-schedule.service';
import { namedPlayers, tournamentState } from './tournament-state';
import { seededRandom } from './seeded-random';

/** A 20-player tournament with its group schedule drawn; `score` fills every match (or leaves it open). */
export function groups20State(
  groupSize: GroupSize,
  seed = 1,
  score?: (match: Match, strength: (id: string) => number) => [number, number],
): TournamentState {
  const players = namedPlayers(20);
  const service = new GroupScheduleService();
  service.random = seededRandom(seed);
  const schedule = service.generate(players, 'rotating', [], false, groupSize);
  // Strength grows with the player number, so a pair's strength decides who wins when scores are not given.
  const strength = (id: string): number => Number(id.slice(1));
  const rounds = schedule.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => {
      if (!score) return match;
      const [scoreA, scoreB] = score(match, strength);
      return { ...match, scoreA, scoreB };
    }),
  }));
  return tournamentState({
    size: 20,
    courts: 20 / groupSize,
    roundCount: groupSize === 5 ? 5 : 3,
    tournamentMode: 'groups',
    groupFormat: 'rotating',
    doublesFormat: 'open',
    groupSize,
    players,
    groups: schedule.groups,
    rounds,
  });
}

/** The stronger pair wins 6-2 (6-3 when equal strength), so standings are driven by the player numbers. */
export function strongerPairWins(match: Match, strength: (id: string) => number): [number, number] {
  const a = match.teamA.reduce((sum, id) => sum + strength(id), 0);
  const b = match.teamB.reduce((sum, id) => sum + strength(id), 0);
  return a >= b ? [6, a === b ? 3 : 2] : [2, 6];
}

/** Every match ends 6-4 to side A: many athletes finish tied, which is what the draws are for. */
export const sideAWins = (): [number, number] => [6, 4];
