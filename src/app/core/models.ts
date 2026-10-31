export type TournamentSize = 8 | 10 | 12;
export type TournamentMode = 'super' | 'groups';
export type GroupFormat = 'fixed' | 'rotating';
export type MatchPhase = 'super' | 'groups' | 'final';
export type FinalMatchKind = 'championship' | 'third-place';
export type SharedTournamentStatus = 'registration' | 'ready' | 'active' | 'completed';
export type TournamentHostingMode = 'local' | 'shared';
export type ThemeMode = 'light' | 'dark';
export type Page = 'setup' | 'overview' | 'players' | 'rounds' | 'ranking' | 'settings' | 'shared';

export interface Player {
  id: string;
  name: string;
}

export interface Match {
  id: string;
  court: number;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
  phase?: MatchPhase;
  groupId?: string;
  finalKind?: FinalMatchKind;
  tieBreakA?: number | null;
  tieBreakB?: number | null;
}

export interface Round {
  number: number;
  matches: Match[];
  restingPlayerIds: string[];
  phase?: MatchPhase;
}

export interface TournamentGroup {
  id: string;
  name: string;
  playerIds: string[];
  fixedPairs?: [string, string][];
}

export interface FinalStage {
  matches: [Match, Match];
  complete: boolean;
  podiumPlayerIds: string[];
}

export interface TieBreakDraw {
  playerIds: string[];
  order: string[];
  createdAt: string;
}

export interface TournamentState {
  version: 1;
  name: string;
  size: TournamentSize;
  courts: number;
  gamesToWin: number;
  roundCount: number;
  players: Player[];
  rounds: Round[];
  createdAt: string;
  tournamentMode?: TournamentMode;
  hostingMode?: TournamentHostingMode;
  sharedTournamentId?: string;
  sharedStatus?: SharedTournamentStatus;
  groupFormat?: GroupFormat;
  groups?: TournamentGroup[];
  fixedPairs?: [string, string][];
  finals?: FinalStage | null;
  tieBreakDraws?: TieBreakDraw[];
}

export interface SharedTournamentSnapshot {
  id: string;
  status: SharedTournamentStatus;
  capacity: TournamentSize;
  state: TournamentState;
  inviteToken?: string;
  inviteExpiresAt: string;
  expiresAt: string | null;
  canJoin?: boolean;
}

export interface PlayerStanding {
  playerId: string;
  name: string;
  setsWon: number;
  gamesFor: number;
  gamesAgainst: number;
  gameBalance: number;
  rests: number;
  matchesPlayed: number;
}
