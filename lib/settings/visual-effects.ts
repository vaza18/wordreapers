/** App visual-effects policy (Auto follows OS Reduce Motion). */
export type VisualEffectsMode = 'auto' | 'selective' | 'off';

export const VISUAL_EFFECTS_MODES: readonly VisualEffectsMode[] = [
  'auto',
  'selective',
  'off',
] as const;

export const DEFAULT_VISUAL_EFFECTS_MODE: VisualEffectsMode = 'auto';

export const VISUAL_EFFECTS_STORAGE_KEY = 'wordreapers.visualEffects';

/** Legacy AsyncStorage keys migrated on first hydrate. */
export const LEGACY_TIMER_VISUAL_COUNTDOWN_KEY = 'wordreapers.timerVisualCountdown';
export const LEGACY_VICTORY_EFFECTS_KEY = 'wordreapers.victoryEffects';

export const DEFAULT_TIMER_PULSE = true;
export const DEFAULT_VICTORY_CELEBRATION = true;
export const DEFAULT_LETTER_PRESS = true;
export const DEFAULT_LETTER_FLY = true;

export type VisualEffectsPreferences = {
  mode: VisualEffectsMode;
  timerPulse: boolean;
  victoryCelebration: boolean;
  letterPress: boolean;
  letterFly: boolean;
};

export type ResolvedVisualEffects = {
  timerPulse: boolean;
  victoryCelebration: boolean;
  letterPress: boolean;
  letterFly: boolean;
  /** Word list entrance, accept-scroll, toast, modal, results headline. */
  generalMotion: boolean;
};

export const DEFAULT_VISUAL_EFFECTS: VisualEffectsPreferences = {
  mode: DEFAULT_VISUAL_EFFECTS_MODE,
  timerPulse: DEFAULT_TIMER_PULSE,
  victoryCelebration: DEFAULT_VICTORY_CELEBRATION,
  letterPress: DEFAULT_LETTER_PRESS,
  letterFly: DEFAULT_LETTER_FLY,
};

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return defaultValue;
}

function parseMode(value: unknown): VisualEffectsMode {
  if (typeof value === 'string' && VISUAL_EFFECTS_MODES.includes(value as VisualEffectsMode)) {
    return value as VisualEffectsMode;
  }
  return DEFAULT_VISUAL_EFFECTS_MODE;
}

/** Parse persisted JSON visual-effects preferences. */
export function parseVisualEffectsPreferences(
  raw: string | null | undefined,
): VisualEffectsPreferences {
  if (!raw) {
    return DEFAULT_VISUAL_EFFECTS;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VisualEffectsPreferences>;
    return {
      mode: parseMode(parsed.mode),
      timerPulse: parseBoolean(parsed.timerPulse, DEFAULT_TIMER_PULSE),
      victoryCelebration: parseBoolean(parsed.victoryCelebration, DEFAULT_VICTORY_CELEBRATION),
      letterPress: parseBoolean(parsed.letterPress, DEFAULT_LETTER_PRESS),
      letterFly: parseBoolean(parsed.letterFly, DEFAULT_LETTER_FLY),
    };
  } catch {
    return DEFAULT_VISUAL_EFFECTS;
  }
}

export type LegacyVisualEffectsRaw = {
  timerVisualCountdown: string | null;
  victoryEffects: string | null;
};

function parseLegacyBoolean(raw: string | null, defaultValue: boolean): boolean {
  if (raw === null) {
    return defaultValue;
  }
  return raw === 'true';
}

/**
 * Build preferences when only legacy timer/victory booleans exist.
 * Custom legacy values → selective mode; defaults → auto.
 */
export function migrateVisualEffectsFromLegacy(
  legacy: LegacyVisualEffectsRaw,
): VisualEffectsPreferences {
  const timerPulse = parseLegacyBoolean(legacy.timerVisualCountdown, DEFAULT_TIMER_PULSE);
  const victoryCelebration = parseLegacyBoolean(legacy.victoryEffects, DEFAULT_VICTORY_CELEBRATION);
  const hadLegacy = legacy.timerVisualCountdown !== null || legacy.victoryEffects !== null;
  const legacyDiffersFromDefaults =
    timerPulse !== DEFAULT_TIMER_PULSE || victoryCelebration !== DEFAULT_VICTORY_CELEBRATION;

  if (!hadLegacy || !legacyDiffersFromDefaults) {
    return DEFAULT_VISUAL_EFFECTS;
  }

  return {
    mode: 'selective',
    timerPulse,
    victoryCelebration,
    letterPress: DEFAULT_LETTER_PRESS,
    letterFly: DEFAULT_LETTER_FLY,
  };
}

/** Effective flags after app mode, selective toggles, and OS Reduce Motion. */
export function resolveVisualEffects(
  prefs: VisualEffectsPreferences,
  osReduceMotion: boolean | null,
): ResolvedVisualEffects {
  // Unknown OS state: assume reduce motion is on so decorative effects do not flash early.
  const osAllowsMotion = osReduceMotion === false;

  if (prefs.mode === 'off') {
    return {
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    };
  }

  if (prefs.mode === 'auto') {
    return {
      timerPulse: osAllowsMotion,
      victoryCelebration: osAllowsMotion,
      letterPress: osAllowsMotion,
      letterFly: osAllowsMotion,
      generalMotion: osAllowsMotion,
    };
  }

  return {
    timerPulse: osAllowsMotion && prefs.timerPulse,
    victoryCelebration: osAllowsMotion && prefs.victoryCelebration,
    letterPress: osAllowsMotion && prefs.letterPress,
    letterFly: osAllowsMotion && prefs.letterFly,
    generalMotion: osAllowsMotion,
  };
}
