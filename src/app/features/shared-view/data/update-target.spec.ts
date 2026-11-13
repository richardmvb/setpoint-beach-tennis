import { describe, expect, it } from 'vitest';
import { match, namedPlayers, round, tournamentState } from '../../../testing/tournament-state';
import { updateTarget } from './update-target';

const players = namedPlayers(4);
const scheduled = tournamentState({ players, rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'])])] });

describe('updateTarget', () => {
  it('points at the finals when they changed or the tournament just ended', () => {
    expect(updateTarget(scheduled, { ...scheduled, finishedAt: '2026-11-13T12:00:00Z' })).toBe('guest-finals');
    const finals = { matches: [], complete: false, podiumPlayerIds: [] };
    expect(updateTarget(scheduled, { ...scheduled, finals })).toBe('guest-finals');
  });

  it('points at the ranking when players changed after the draw, else at the participants', () => {
    const renamed = { ...scheduled, players: [{ ...players[0], name: 'Outra' }, ...players.slice(1)] };
    expect(updateTarget(scheduled, renamed)).toBe('guest-ranking');
    const registration = tournamentState({ players });
    expect(updateTarget(registration, tournamentState({ players: namedPlayers(5) }))).toBe('guest-participants');
  });

  it('points at the rounds when a score changed', () => {
    const scored = tournamentState({ players, rounds: [round(1, [match('m1', ['p1', 'p2'], ['p3', 'p4'], 4, 1)])] });
    expect(updateTarget(scheduled, scored)).toBe('guest-rounds');
  });

  it('falls back to the ranking, or the participants before the draw', () => {
    expect(updateTarget(scheduled, { ...scheduled, name: 'Novo nome' })).toBe('guest-ranking');
    const registration = tournamentState({ players });
    expect(updateTarget(registration, { ...registration, name: 'Novo nome' })).toBe('guest-participants');
  });
});
