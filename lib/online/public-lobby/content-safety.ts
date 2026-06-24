import type { GameSession, GameSessionSettings } from '../../firebase/types.js';

import { sessionHadPublicBrowseExposure } from './session-identity.js';
import { isPublicBaseWordSafeFromDisplay } from './validate-public-base-word.js';

export const PUBLIC_SAFE_SESSION_SETTINGS = {
  allowProperNouns: false,
  allowSlang: false,
} as const;

export type CanPublishPublicFailure =
  | 'NOT_WAITING'
  | 'BASE_WORD_NOT_ALLOWED_PUBLIC'
  | 'BASE_WORD_MISSING';

export type CanPublishPublicResult = { ok: true } | { ok: false; reason: CanPublishPublicFailure };

/**
 * Client-side gate before toggling public lobby (organizer, waiting, safe base word).
 */
export function canPublishPublicRoom(
  session: Pick<GameSession, 'status' | 'baseWord' | 'settings'>,
  baseWords: readonly string[],
): CanPublishPublicResult {
  if (session.status !== 'waiting') {
    return { ok: false, reason: 'NOT_WAITING' };
  }
  if (!session.baseWord || session.baseWord.trim().length < 2) {
    return { ok: false, reason: 'BASE_WORD_MISSING' };
  }
  if (!isPublicBaseWordSafeFromDisplay(session.baseWord, baseWords)) {
    return { ok: false, reason: 'BASE_WORD_NOT_ALLOWED_PUBLIC' };
  }
  return { ok: true };
}

/** Merge public-safe dictionary flags into session settings at publish. */
export function withPublicSafeSettings(settings: GameSessionSettings): GameSessionSettings {
  return {
    ...settings,
    ...PUBLIC_SAFE_SESSION_SETTINGS,
  };
}

/**
 * Lock while the room is public, or permanently after a browse-list join.
 * A brief public toggle before anyone joins via browse is reversible.
 */
export function sessionContentSafetyLocked(
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
): boolean {
  if (session.isPublic === true) {
    return true;
  }
  return sessionHadPublicBrowseExposure(session);
}

export type SessionBaseWordFailure = 'BASE_WORD_MISSING' | 'BASE_WORD_NOT_ALLOWED';

/**
 * When content safety is locked, base word must come from the public allowlist (`base_words.txt`).
 */
export function validateSessionBaseWord(
  baseWord: string,
  baseWords: readonly string[],
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
): { ok: true } | { ok: false; reason: SessionBaseWordFailure } {
  if (!baseWord || baseWord.length < 2) {
    return { ok: false, reason: 'BASE_WORD_MISSING' };
  }
  if (!sessionContentSafetyLocked(session)) {
    return { ok: true };
  }
  if (!isPublicBaseWordSafeFromDisplay(baseWord, baseWords)) {
    return { ok: false, reason: 'BASE_WORD_NOT_ALLOWED' };
  }
  return { ok: true };
}

/** Enforce locked dictionary flags on resolved settings. */
export function applyPublicContentSafety(
  settings: GameSessionSettings,
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
): GameSessionSettings {
  if (!sessionContentSafetyLocked(session)) {
    return settings;
  }
  return withPublicSafeSettings(settings);
}

/** Browse filter: player's selected game language. */
export function playerLanguageForBrowse(settings: Pick<GameSessionSettings, 'language'>): string {
  return settings.language;
}
