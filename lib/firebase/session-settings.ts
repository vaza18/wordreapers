import type { UniqueBonusMode } from '../game/scoring.js';
import { resolveUniqueBonusEnabled } from '../game/scoring.js';
import {
  DEFAULT_GAME_SETUP_PREFERENCES,
  parseGameSetupPreferences,
} from '../settings/game-setup-preferences.js';

import { applyPublicContentSafety } from '../online/public-lobby/content-safety.js';

import type { GameSession, GameSessionSettings } from './types.js';

export function defaultGameSessionSettings(
  durationMinutes = DEFAULT_GAME_SETUP_PREFERENCES.durationMinutes,
  uniqueBonusMode = DEFAULT_GAME_SETUP_PREFERENCES.uniqueBonusMode,
  allowProperNouns = DEFAULT_GAME_SETUP_PREFERENCES.allowProperNouns,
  allowSlang = DEFAULT_GAME_SETUP_PREFERENCES.allowSlang,
  playerCount = 2,
): GameSessionSettings {
  return {
    durationSeconds: durationMinutes * 60,
    uniqueBonusMode,
    uniqueBonusEnabled: resolveUniqueBonusEnabled(uniqueBonusMode, playerCount),
    language: 'uk-uk',
    allowProperNouns,
    allowSlang,
  };
}

function uniqueBonusModeFromSettings(settings: Partial<GameSessionSettings>): UniqueBonusMode {
  if (settings.uniqueBonusMode === 'auto' || settings.uniqueBonusMode === 'off') {
    return settings.uniqueBonusMode;
  }
  return settings.uniqueBonusEnabled ? 'auto' : 'off';
}
export function playerCountForSession(session: Pick<GameSession, 'players'>): number {
  return Object.keys(session.players ?? {}).length;
}

/**
 * Unique bonus for scoring during an active or just-finished round.
 * Roster size can grow mid-round (invite QR), but rules are frozen from round start.
 */
export function uniqueBonusEnabledForActiveRound(
  session: Pick<GameSession, 'settings' | 'players' | 'status'>,
): boolean {
  if (session.status === 'playing' || session.status === 'finished') {
    const stored = session.settings?.uniqueBonusEnabled;
    if (typeof stored === 'boolean') {
      return stored;
    }
  }
  return resolveGameSessionSettings(session.settings, playerCountForSession(session))
    .uniqueBonusEnabled;
}

/** Apply roster-dependent fields (e.g. auto x2 for 3+ players) to stored settings. */
export function resolveGameSessionSettingsForSession(
  session: Pick<GameSession, 'settings' | 'players' | 'identityMasked' | 'isPublic'> & {
    status?: GameSession['status'];
  },
): GameSessionSettings {
  const playerCount = playerCountForSession(session);
  const resolved = resolveGameSessionSettings(session.settings, playerCount);
  const uniqueBonusEnabled =
    session.status === 'playing' || session.status === 'finished'
      ? uniqueBonusEnabledForActiveRound(
          session as Pick<GameSession, 'settings' | 'players' | 'status'>,
        )
      : resolved.uniqueBonusEnabled;
  return applyPublicContentSafety({ ...resolved, uniqueBonusEnabled }, session);
}

/** Fallback for partial RTDB snapshots missing `settings`. */
export function resolveGameSessionSettings(
  settings?: GameSessionSettings | null,
  playerCount = 2,
): GameSessionSettings {
  const defaults = defaultGameSessionSettings(
    undefined,
    undefined,
    undefined,
    undefined,
    playerCount,
  );
  if (!settings) {
    return defaults;
  }
  const uniqueBonusMode = uniqueBonusModeFromSettings(settings);
  return {
    durationSeconds:
      typeof settings.durationSeconds === 'number'
        ? settings.durationSeconds
        : defaults.durationSeconds,
    uniqueBonusMode,
    uniqueBonusEnabled: resolveUniqueBonusEnabled(uniqueBonusMode, playerCount),
    language: settings.language ?? defaults.language,
    allowProperNouns: settings.allowProperNouns ?? defaults.allowProperNouns,
    allowSlang: settings.allowSlang ?? defaults.allowSlang,
  };
}

/** Build RTDB settings from setup form values. */
export function gameSessionSettingsFromSetup(
  durationMinutes: number,
  uniqueBonusMode: UniqueBonusMode,
  allowProperNouns: boolean,
  allowSlang: boolean,
  playerCount: number,
): GameSessionSettings {
  return defaultGameSessionSettings(
    durationMinutes,
    uniqueBonusMode,
    allowProperNouns,
    allowSlang,
    playerCount,
  );
}

/** Parse persisted local game-setup JSON (AsyncStorage). */
export { parseGameSetupPreferences };
