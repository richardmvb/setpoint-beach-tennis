import type { Player, PlayerGender, TournamentState } from '../../core/models';
import { defaultFixedPairs, isMixedDoubles } from '../tournament-view/format';
import { hasSchedule } from './setup-rules';

export type PlayerError = 'needsGender' | 'locked' | 'shared' | 'full' | 'duplicate' | 'empty';

export type PlayerResult = { state: TournamentState } | { error: PlayerError };

export interface NewPlayer {
  name: string;
  gender: PlayerGender | '';
  avatar: string;
}

function withDefaultFixedPairs(state: TournamentState): TournamentState {
  return { ...state, fixedPairs: defaultFixedPairs(state) };
}

/** Adds one athlete to a local tournament, or says why not. `id` is the new athlete's id. */
export function addPlayer(state: TournamentState, input: NewPlayer, id: string): PlayerResult {
  const name = input.name.trim();
  if (!name) return { error: 'empty' };
  const mixed = isMixedDoubles(state);
  if (mixed && !input.gender) return { error: 'needsGender' };
  if (hasSchedule(state)) return { error: 'locked' };
  if (state.hostingMode === 'shared') return { error: 'shared' };
  if (state.players.length >= state.size) return { error: 'full' };
  if (state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    return { error: 'duplicate' };
  const player: Player = {
    id,
    name,
    ...(mixed && input.gender ? { gender: input.gender } : {}),
    ...(input.avatar ? { photoDataUrl: input.avatar } : {}),
  };
  return { state: withDefaultFixedPairs({ ...state, players: [...state.players, player] }) };
}

export function removePlayer(state: TournamentState, id: string): PlayerResult {
  if (hasSchedule(state)) return { error: 'locked' };
  if (state.hostingMode === 'shared') return { error: 'shared' };
  return { state: withDefaultFixedPairs({ ...state, players: state.players.filter((player) => player.id !== id) }) };
}

export function setPlayerGender(state: TournamentState, playerId: string, gender: PlayerGender | ''): TournamentState {
  if (hasSchedule(state) || !isMixedDoubles(state)) return state;
  if (!state.players.some((player) => player.id === playerId)) return state;
  const players = state.players.map((player) => {
    if (player.id !== playerId) return player;
    const { gender: _previous, ...rest } = player;
    return gender ? { ...rest, gender } : rest;
  });
  return withDefaultFixedPairs({ ...state, players });
}

export function addPlayers(
  state: TournamentState,
  drafts: readonly { name: string; gender: PlayerGender | '' }[],
  ids: readonly string[],
): TournamentState {
  const mixed = isMixedDoubles(state);
  const added = drafts.map((draft, index): Player => ({
    id: ids[index],
    name: draft.name.trim(),
    ...(mixed ? { gender: draft.gender as PlayerGender } : {}),
  }));
  return withDefaultFixedPairs({ ...state, players: [...state.players, ...added] });
}

/** The pair list when `playerId` is put in `side` of pair `pairIndex` (the previous holder swaps places). */
export function swapFixedPair(
  state: TournamentState,
  pairIndex: number,
  side: 0 | 1,
  playerId: string,
): { state: TournamentState } | { error: 'mixedPair' } {
  const pairs = (state.fixedPairs ?? []).map((pair) => [...pair] as [string, string]);
  if (!pairs[pairIndex]) return { state };
  const previousPlayerId = pairs[pairIndex][side];
  const otherPairIndex = pairs.findIndex((pair, index) => index !== pairIndex && pair.includes(playerId));
  if (otherPairIndex >= 0) {
    const otherSide = pairs[otherPairIndex].findIndex((id) => id === playerId) as 0 | 1;
    pairs[otherPairIndex][otherSide] = previousPlayerId;
  }
  pairs[pairIndex][side] = playerId;
  if (
    isMixedDoubles(state) &&
    pairs.some((pair) => {
      const firstGender = state.players.find((player) => player.id === pair[0])?.gender;
      const secondGender = state.players.find((player) => player.id === pair[1])?.gender;
      return !firstGender || !secondGender || firstGender === secondGender;
    })
  ) {
    return { error: 'mixedPair' };
  }
  return { state: { ...state, fixedPairs: pairs } };
}
