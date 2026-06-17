import type { UniqueBonusMode } from '../game/scoring.js';

const DURATION_MIN_MINUTES = 5;
const DURATION_MAX_MINUTES = 20;

export const GAME_SETUP_STORAGE_KEY = 'wordreapers.gameSetup';

/** Last organizer choices on the new-game setup screen. */
export interface GameSetupPreferences {
  durationMinutes: number;
  uniqueBonusMode: UniqueBonusMode;
  allowProperNouns: boolean;
  allowSlang: boolean;
}

export const DEFAULT_GAME_SETUP_PREFERENCES: GameSetupPreferences = {
  durationMinutes: 10,
  uniqueBonusMode: 'auto',
  allowProperNouns: false,
  allowSlang: false,
};

function parseUniqueBonusMode(value: unknown): UniqueBonusMode {
  if (value === 'off') {
    return 'off';
  }
  if (value === 'auto') {
    return 'auto';
  }
  return DEFAULT_GAME_SETUP_PREFERENCES.uniqueBonusMode;
}

function clampDuration(minutes: unknown): number {
  const numeric = typeof minutes === 'number' ? minutes : Number(minutes);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_GAME_SETUP_PREFERENCES.durationMinutes;
  }
  return Math.min(DURATION_MAX_MINUTES, Math.max(DURATION_MIN_MINUTES, Math.round(numeric)));
}

/**
 * Parse persisted JSON for game setup defaults.
 */
export function parseGameSetupPreferences(raw: string | null): GameSetupPreferences {
  if (!raw) {
    return DEFAULT_GAME_SETUP_PREFERENCES;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GameSetupPreferences>;
    return {
      durationMinutes: clampDuration(parsed.durationMinutes),
      uniqueBonusMode: parseUniqueBonusMode(parsed.uniqueBonusMode),
      allowProperNouns: Boolean(parsed.allowProperNouns),
      allowSlang: Boolean(parsed.allowSlang),
    };
  } catch {
    return DEFAULT_GAME_SETUP_PREFERENCES;
  }
}
