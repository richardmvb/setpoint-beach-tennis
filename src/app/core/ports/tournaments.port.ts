import { InjectionToken } from '@angular/core';
import type { LocalLiveTournamentSnapshot, PlayerGender, SharedTournamentSnapshot, TournamentState } from '../models';

/** Tournaments shared through an invite link: one moderator, many guests. */
export interface SharedTournamentRepository {
  createSharedTournament(
    state: TournamentState,
    moderatorName: string,
    moderatorGender?: PlayerGender,
    moderatorPhoto?: string,
  ): Promise<SharedTournamentSnapshot>;
  joinSharedTournament(
    inviteToken: string,
    displayName: string,
    gender?: PlayerGender,
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot>;
  /** The name this device used the last time it joined with this invite, or an empty string. */
  getGuestName(inviteToken: string): Promise<string>;
  getSharedTournament(inviteToken: string): Promise<SharedTournamentSnapshot>;
  getOwnedSharedTournament(id: string): Promise<SharedTournamentSnapshot>;
  addSharedParticipant(
    id: string,
    displayName: string,
    gender?: PlayerGender,
    photoDataUrl?: string,
  ): Promise<SharedTournamentSnapshot>;
  removeSharedParticipant(id: string, playerId: string): Promise<SharedTournamentSnapshot>;
  cancelSharedTournament(id: string): Promise<void>;
  rotateSharedInvite(id: string): Promise<{ inviteToken: string; inviteExpiresAt: string }>;
  startSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot>;
  saveSharedTournament(id: string, state: TournamentState): Promise<SharedTournamentSnapshot>;
  syncSharedTournament(id: string, base: TournamentState, state: TournamentState): Promise<SharedTournamentSnapshot>;
}
export const SHARED_TOURNAMENTS = new InjectionToken<SharedTournamentRepository>('SharedTournamentRepository');

/** A local tournament published through a live link: the owner writes with a write token, viewers read with a read token. */
export interface LocalLiveRepository {
  createLocalLiveTournament(state: TournamentState): Promise<{ id: string; readToken: string; writeToken: string }>;
  updateLocalLiveTournament(writeToken: string, state: TournamentState): Promise<LocalLiveTournamentSnapshot>;
  getLocalLiveTournament(readToken: string): Promise<LocalLiveTournamentSnapshot>;
  syncLocalLiveTournament(
    writeToken: string,
    base: TournamentState,
    state: TournamentState,
  ): Promise<LocalLiveTournamentSnapshot>;
}
export const LOCAL_LIVE = new InjectionToken<LocalLiveRepository>('LocalLiveRepository');
