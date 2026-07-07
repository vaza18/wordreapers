import type { UniqueBonusMode } from '../game/scoring.js';
import { resolveUniqueBonusEnabled } from '../game/scoring.js';
import {
  DEFAULT_GAME_SETUP_PREFERENCES,
  parseGameSetupPreferences,
} from '../settings/game-setup-preferences.js';

import { applyPublicContentSafety } from '../online/public-lobby/content-safety.js';
import { assertUniqueBonusRoundLatch } from '../online/invariants.js';
import { waitingLobbyOptInUids } from '../online/presence/live-round-membership.js';

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

/** Player count for auto x2: full roster in round 1; live-round roster in rematch rounds. */
export function playerCountForUniqueBonus(
  session: Pick<GameSession, 'players' | 'baseWordRound' | 'liveRoundPlayerUids'> & {
    status?: GameSession['status'];
  },
): number {
  const round = session.baseWordRound ?? 0;
  if (round === 0) {
    return playerCountForSession(session);
  }
  if (session.status === 'playing' || session.status === 'finished') {
    return session.liveRoundPlayerUids?.length ?? 0;
  }
  return waitingLobbyOptInUids(session).length;
}

/**
 * Whether x2 applies for the current round.
 * Auto: on at 3+ live-round participants; latches on for playing/finished (never turns off mid-round).
 * Off: always false for the round — no mid-round score recompute for x2.
 */
export function uniqueBonusEnabledForActiveRound(
  session: Pick<GameSession, 'settings' | 'players' | 'baseWordRound' | 'liveRoundPlayerUids'> & {
    status?: GameSession['status'];
  },
): boolean {
  const mode = uniqueBonusModeFromSettings(session.settings ?? {});
  if (mode === 'off') {
    return false;
  }
  const storedEnabled = session.settings?.uniqueBonusEnabled === true;
  const rosterEnables = playerCountForUniqueBonus(session) >= 3;
  if (session.status === 'playing' || session.status === 'finished') {
    return storedEnabled || rosterEnables;
  }
  return rosterEnables;
}

/** RTDB settings patch when auto x2 latches on during `playing` (rules allow false → true only). */
export function uniqueBonusLatchSettingsPatch(
  session: Pick<GameSession, 'settings' | 'players' | 'baseWordRound' | 'liveRoundPlayerUids'> & {
    status?: GameSession['status'];
  },
): GameSessionSettings | null {
  if (session.status !== 'playing') {
    return null;
  }
  if (uniqueBonusModeFromSettings(session.settings ?? {}) !== 'auto') {
    return null;
  }
  if (session.settings?.uniqueBonusEnabled === true) {
    return null;
  }
  const playerCount = playerCountForUniqueBonus(session);
  if (playerCount < 3) {
    return null;
  }
  return {
    ...resolveGameSessionSettings(session.settings, playerCount),
    uniqueBonusEnabled: true,
  };
}

// INVARIANT (see docs/known-issues.md — 2026-06 Unique bonus changed mid-round): x2 latches on at 3+, never off mid-round.
/** Apply roster-dependent fields (e.g. auto x2 for 3+ players) to stored settings. */
export function resolveGameSessionSettingsForSession(
  session: Pick<
    GameSession,
    'settings' | 'players' | 'identityMasked' | 'isPublic' | 'baseWordRound' | 'liveRoundPlayerUids'
  > & {
    status?: GameSession['status'];
  },
): GameSessionSettings {
  const playerCount = playerCountForUniqueBonus(session);
  const base = resolveGameSessionSettings(session.settings, playerCount);
  const uniqueBonusEnabled = uniqueBonusEnabledForActiveRound(session);
  const result = applyPublicContentSafety({ ...base, uniqueBonusEnabled }, session);
  assertUniqueBonusRoundLatch(session, result);
  return result;
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
