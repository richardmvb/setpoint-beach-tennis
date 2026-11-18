import type {
  DoublesFormat,
  FinalsPairing,
  GroupFormat,
  GroupSize,
  MixedFinalFormat,
  TournamentHostingMode,
  TournamentMode,
  TournamentSize,
  TournamentState,
} from '../../core/models';
import {
  defaultFixedPairs,
  fixedPairsMode,
  groupSizeOf,
  isEarlyFinalsOptionAvailable,
  isGroupTournament,
  isMixedDoubles,
  usesGroupQualification,
} from '../tournament-view/format';

/** A tournament with nothing chosen yet: Super 8 on 2 courts, played on this device. */
export function newTournament(createdAt: string): TournamentState {
  return {
    version: 1,
    name: 'Super de sábado',
    size: 8,
    courts: 2,
    gamesToWin: 4,
    roundCount: 7,
    players: [],
    rounds: [],
    createdAt,
    tournamentMode: 'super',
    hostingMode: 'local',
    groupFormat: 'rotating',
    groups: [],
    fixedPairs: [],
    finals: null,
  };
}

export function availableGamesToWin(state: TournamentState): number[] {
  return isGroupTournament(state) ? [4, 5, 6] : [3, 4, 5, 6];
}

export function availableSizes(state: TournamentState): TournamentSize[] {
  if (!isGroupTournament(state)) return [8, 10, 12, 24];
  return !fixedPairsMode(state) && !isMixedDoubles(state) ? [8, 12, 20, 24] : [8, 12, 24];
}

export function availableCourts(state: TournamentState): number[] {
  if (state.size === 20 && isGroupTournament(state)) {
    // One court per group is the full schedule; fewer courts make the groups take turns (see usesCourtQueue).
    const perRound = 20 / groupSizeOf(state);
    return Array.from({ length: perRound - 1 }, (_, index) => perRound - index);
  }
  if (isGroupTournament(state)) return [state.size / 4];
  if (state.size === 24) return isMixedDoubles(state) ? [6, 3] : [6];
  return state.size === 12 ? [2, 3] : [2];
}

export function requiredRounds(state: TournamentState): number {
  if (isGroupTournament(state)) {
    if (fixedPairsMode(state)) return state.size / 2 - 1;
    if (isMixedDoubles(state)) return 2;
    return groupSizeOf(state) === 5 ? 5 : 3;
  }
  if (state.size === 24 && isMixedDoubles(state)) {
    return state.rounds.length || (state.courts === 3 ? 24 : 12);
  }
  if (state.size === 24 && state.courts === 3) return 46;
  if (state.size === 10) return 10;
  if (state.size === 12 && state.courts === 2) return 12;
  return state.size - 1;
}

export function hasSchedule(state: TournamentState): boolean {
  return state.rounds.length > 0;
}

function withDefaultFixedPairs(state: TournamentState): TournamentState {
  return { ...state, fixedPairs: defaultFixedPairs(state) };
}

function normalizeGamesToWin(state: TournamentState): TournamentState {
  return availableGamesToWin(state).includes(state.gamesToWin) ? state : { ...state, gamesToWin: 4 };
}

/** The wizard's name field: a blank name falls back to a default when the step is left. */
export function withName(state: TournamentState, name: string): TournamentState {
  return { ...state, name };
}

export function withTrimmedName(state: TournamentState): TournamentState {
  return { ...state, name: state.name.trim() || 'Meu torneio' };
}

export function withGamesToWin(state: TournamentState, gamesToWin: number): TournamentState {
  return { ...state, gamesToWin };
}

export function withSize(state: TournamentState, size: number): TournamentState {
  if (!availableSizes(state).includes(size as TournamentSize)) return state;
  let next: TournamentState = normalizeSizeAndQualification({ ...state, size: size as TournamentSize });
  next = { ...next, courts: availableCourts(next)[0] };
  next = normalizeGamesToWin(next);
  next = { ...next, roundCount: requiredRounds(next) };
  return withDefaultFixedPairs(next);
}

/** 5 groups of 4 or 4 groups of 5; only the 20-player format has the choice, and only before the draw. */
export function withGroupSize(state: TournamentState, groupSize: GroupSize): TournamentState {
  if (hasSchedule(state) || !usesGroupQualification(state)) return state;
  let next: TournamentState = { ...state, groupSize };
  next = { ...next, courts: availableCourts(next)[0] };
  return { ...next, roundCount: requiredRounds(next) };
}

/** How the 12 qualifiers become pairs; editable until the finals exist. */
export function withFinalsPairing(state: TournamentState, finalsPairing: FinalsPairing): TournamentState {
  if (state.finals || !usesGroupQualification(state)) return state;
  return { ...state, finalsPairing };
}

export function withCourts(state: TournamentState, courts: number): TournamentState {
  if (!availableCourts(state).includes(courts)) return state;
  let next: TournamentState = { ...state, courts };
  if (!isEarlyFinalsOptionAvailable(next)) next = { ...next, earlyFinalsEnabled: false };
  return { ...next, roundCount: requiredRounds(next) };
}

export function withTournamentMode(state: TournamentState, mode: TournamentMode): TournamentState {
  let next: TournamentState = normalizeSizeAndQualification({ ...state, tournamentMode: mode });
  if (!availableSizes(next).includes(next.size)) next = { ...next, size: 8 };
  next = { ...next, courts: availableCourts(next)[0] };
  next = normalizeGamesToWin(next);
  next = { ...next, roundCount: requiredRounds(next) };
  return withDefaultFixedPairs(next);
}

/** The size and the 20-player choices only exist while the format is valid; back to the nearest size otherwise. */
function normalizeSizeAndQualification(state: TournamentState): TournamentState {
  let next = state;
  if (!availableSizes(next).includes(next.size)) next = { ...next, size: next.size === 20 ? 24 : 8 };
  if (!usesGroupQualification(next)) {
    next = { ...next };
    delete next.groupSize;
    delete next.finalsPairing;
  }
  return next;
}

export function withDoublesFormat(state: TournamentState, format: DoublesFormat): TournamentState {
  if (hasSchedule(state)) return state;
  let next: TournamentState = normalizeSizeAndQualification({ ...state, doublesFormat: format });
  if (!availableCourts(next).includes(next.courts)) next = { ...next, courts: availableCourts(next)[0] };
  if (!isEarlyFinalsOptionAvailable(next)) next = { ...next, earlyFinalsEnabled: false };
  next = { ...next, roundCount: requiredRounds(next) };
  return withDefaultFixedPairs(next);
}

export function withGroupFormat(state: TournamentState, format: GroupFormat): TournamentState {
  let next: TournamentState = normalizeSizeAndQualification({ ...state, groupFormat: format });
  next = { ...next, courts: availableCourts(next)[0] };
  next = { ...next, roundCount: requiredRounds(next) };
  return withDefaultFixedPairs(next);
}

/** Shared tournaments show the athletes' projection by default; a local one never does. */
export function withHostingMode(state: TournamentState, mode: TournamentHostingMode): TournamentState {
  if (hasSchedule(state)) return state;
  return {
    ...state,
    hostingMode: mode,
    qualificationStats: mode === 'shared' ? (state.qualificationStats ?? true) : false,
  };
}

export function withQualificationStats(state: TournamentState, enabled: boolean): TournamentState {
  return hasSchedule(state) ? state : { ...state, qualificationStats: enabled };
}

export function withEarlyFinals(state: TournamentState, enabled: boolean): TournamentState {
  if (hasSchedule(state) || !isEarlyFinalsOptionAvailable(state)) return state;
  return { ...state, earlyFinalsEnabled: enabled, mixedFinalFormat: state.mixedFinalFormat ?? 'knockout' };
}

export function withMixedFinalFormat(state: TournamentState, format: MixedFinalFormat): TournamentState {
  if (hasSchedule(state) || !isEarlyFinalsOptionAvailable(state)) return state;
  return { ...state, mixedFinalFormat: format };
}

/** The round count the format needs, written to the state when a step is left or the settings are saved. */
export function withRequiredRounds(state: TournamentState): TournamentState {
  return { ...state, roundCount: requiredRounds(state) };
}

/** How the enrolment looks on step 2, as data the screen turns into words. */
export type Enrollment =
  | { kind: 'shared'; missing: number }
  | { kind: 'mixed'; missing: number; men: number; women: number; half: number }
  | { kind: 'open'; missing: number };

export function enrollment(state: TournamentState): Enrollment {
  const missing = state.size - state.players.length;
  if (state.hostingMode === 'shared') return { kind: 'shared', missing };
  if (isMixedDoubles(state)) {
    const men = state.players.filter((player) => player.gender === 'male').length;
    const women = state.players.filter((player) => player.gender === 'female').length;
    return { kind: 'mixed', missing, men, women, half: state.size / 2 };
  }
  return { kind: 'open', missing };
}

/** What step 3 says about the draw. */
export function reviewKind(state: TournamentState): 'fixedPairs' | 'groups' | 'groupsQualification' | 'super' {
  if (fixedPairsMode(state)) return 'fixedPairs';
  if (usesGroupQualification(state)) return 'groupsQualification';
  return isGroupTournament(state) ? 'groups' : 'super';
}

/**
 * A tournament read from this device (or from an older version), with every field a later version added filled in,
 * and, while it has no schedule, courts and rounds that fit its size. Returns a new object; the input is not changed.
 */
export function normalizeStoredTournament(stored: TournamentState): TournamentState {
  const state: TournamentState = {
    ...stored,
    tournamentMode: stored.tournamentMode ?? 'super',
    doublesFormat: stored.doublesFormat ?? 'open',
    hostingMode: stored.hostingMode ?? 'local',
    groupFormat: stored.groupFormat ?? 'rotating',
    groups: stored.groups ?? [],
    fixedPairs: stored.fixedPairs ?? [],
    finals: stored.finals ?? null,
    tieBreakDraws: stored.tieBreakDraws ?? [],
  };
  if (state.rounds.length) return state;
  const courts = availableCourts(state).includes(state.courts)
    ? state.courts
    : state.size === 20
      ? availableCourts(state)[0]
      : Math.floor(state.size / 4);
  const fitted = { ...state, courts };
  return { ...fitted, roundCount: requiredRounds(fitted) };
}
