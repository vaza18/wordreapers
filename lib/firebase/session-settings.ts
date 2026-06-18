import type { UniqueBonusMode } from '../game/scoring.js';
import { resolveUniqueBonusEnabled } from '../game/scoring.js';
import {
  DEFAULT_GAME_SETUP_PREFERENCES,
  parseGameSetupPreferences,
} from '../settings/game-setup-preferences.js';

import type { GameSessionSettings } from './types.js';

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
