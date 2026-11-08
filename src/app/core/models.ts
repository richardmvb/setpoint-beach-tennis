export type TournamentSize = 8 | 10 | 12 | 24;
export type TournamentMode = 'super' | 'groups';
export type GroupFormat = 'fixed' | 'rotating';
export type DoublesFormat = 'open' | 'mixed';
export type PlayerGender = 'male' | 'female';
export type MixedFinalFormat = 'knockout' | 'direct';
export type MatchPhase = 'super' | 'groups' | 'final';
export type FinalMatchKind = 'quarterfinal' | 'semifinal' | 'championship' | 'third-place';
export type SharedTournamentStatus = 'registration' | 'ready' | 'active' | 'completed' | 'archived';
export type TournamentHostingMode = 'local' | 'shared';
export type ThemeMode = 'light' | 'dark';
export type Page = 'setup' | 'overview' | 'players' | 'rounds' | 'ranking' | 'settings' | 'shared' | 'dashboard';

export interface Player {
  id: string;
  name: string;
  gender?: PlayerGender;
  photoDataUrl?: string;
  manual?: boolean;
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
  livePoints?: ('A' | 'B')[];
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
  matches: Match[];
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
  startedAt?: string;
  finishedAt?: string;
  analyticsId?: string;
  tournamentMode?: TournamentMode;
  doublesFormat?: DoublesFormat;
  hostingMode?: TournamentHostingMode;
  qualificationStats?: boolean;
  earlyFinalsEnabled?: boolean;
  mixedFinalFormat?: MixedFinalFormat;
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

export interface LocalLiveTournamentSnapshot {
  id: string;
  status: 'active' | 'completed' | 'archived';
  state: TournamentState;
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
