import type { Player, PlayerGender } from './models';

/** Local, device-only identity of whoever runs the app. Never sent anywhere on its own. */
export interface LocalProfile {
  name: string;
  photoDataUrl?: string;
  gender?: PlayerGender;
  /** When true, the profile is added as a player to every new local tournament. Off = "only manage". */
  autoJoin: boolean;
}

export const PROFILE_KEY = 'setpoint.profile.v1';
export const PROFILE_NAME_MAX = 40;
const PHOTO_MAX_CHARS = 400_000;

export const EMPTY_PROFILE: LocalProfile = { name: '', autoJoin: true };

/** Set once the welcome profile prompt was shown, so it never pops up again on this device. */
export const PROFILE_PROMPTED_KEY = 'setpoint.profile.prompted';

/** The profile is offered once, right after the landing page, and only while it is still empty. */
export function shouldPromptProfile(profile: LocalProfile, alreadyPrompted: boolean): boolean {
  return !alreadyPrompted && !profile.name.trim();
}

export function parseProfile(raw: string | null): LocalProfile {
  if (!raw || raw.length > PHOTO_MAX_CHARS + 2_000) return { ...EMPTY_PROFILE };
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof LocalProfile, unknown>> | null;
    if (!value || typeof value !== 'object') return { ...EMPTY_PROFILE };
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, PROFILE_NAME_MAX) : '';
    const photo = typeof value.photoDataUrl === 'string' && value.photoDataUrl.startsWith('data:image/') && value.photoDataUrl.length <= PHOTO_MAX_CHARS ? value.photoDataUrl : '';
    const gender = value.gender === 'male' || value.gender === 'female' ? value.gender : undefined;
    return { name, autoJoin: value.autoJoin !== false, ...(photo ? { photoDataUrl: photo } : {}), ...(gender ? { gender } : {}) };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

export function serializeProfile(profile: LocalProfile): string {
  return JSON.stringify(parseProfile(JSON.stringify(profile)));
}

export type AutoJoinResult = { player: Omit<Player, 'id'> } | { skipped: 'off' | 'no-name' | 'full' | 'present' | 'needs-gender' };

/** Decides whether (and how) the profile owner enters a fresh local tournament as a player. */
export function profileAutoJoin(profile: LocalProfile, players: Player[], size: number, mixedDoubles: boolean): AutoJoinResult {
  const name = profile.name.trim();
  if (!profile.autoJoin) return { skipped: 'off' };
  if (!name) return { skipped: 'no-name' };
  if (players.some(player => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return { skipped: 'present' };
  if (players.length >= size) return { skipped: 'full' };
  if (mixedDoubles && !profile.gender) return { skipped: 'needs-gender' };
  return { player: {
    name,
    ...(mixedDoubles && profile.gender ? { gender: profile.gender } : {}),
    ...(profile.photoDataUrl ? { photoDataUrl: profile.photoDataUrl } : {})
  } };
}
