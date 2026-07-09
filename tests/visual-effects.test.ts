import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VISUAL_EFFECTS,
  migrateVisualEffectsFromLegacy,
  parseVisualEffectsPreferences,
  resolveVisualEffects,
  type VisualEffectsPreferences,
} from '@/lib/settings/visual-effects';

describe('parseVisualEffectsPreferences', () => {
  it('returns defaults for missing or invalid JSON', () => {
    expect(parseVisualEffectsPreferences(null)).toEqual(DEFAULT_VISUAL_EFFECTS);
    expect(parseVisualEffectsPreferences(undefined)).toEqual(DEFAULT_VISUAL_EFFECTS);
    expect(parseVisualEffectsPreferences('not-json')).toEqual(DEFAULT_VISUAL_EFFECTS);
  });

  it('parses valid persisted preferences', () => {
    const raw = JSON.stringify({
      mode: 'selective',
      timerPulse: false,
      victoryCelebration: true,
      letterPress: false,
      letterFly: true,
    });
    expect(parseVisualEffectsPreferences(raw)).toEqual({
      mode: 'selective',
      timerPulse: false,
      victoryCelebration: true,
      letterPress: false,
      letterFly: true,
    });
  });

  it('falls back invalid mode to auto', () => {
    const raw = JSON.stringify({ mode: 'custom' });
    expect(parseVisualEffectsPreferences(raw).mode).toBe('auto');
  });
});

describe('migrateVisualEffectsFromLegacy', () => {
  it('returns auto defaults when no legacy keys exist', () => {
    expect(
      migrateVisualEffectsFromLegacy({
        timerVisualCountdown: null,
        victoryEffects: null,
      }),
    ).toEqual(DEFAULT_VISUAL_EFFECTS);
  });

  it('returns auto defaults when legacy values match defaults', () => {
    expect(
      migrateVisualEffectsFromLegacy({
        timerVisualCountdown: 'true',
        victoryEffects: 'true',
      }),
    ).toEqual(DEFAULT_VISUAL_EFFECTS);
  });

  it('migrates custom legacy booleans to selective mode', () => {
    expect(
      migrateVisualEffectsFromLegacy({
        timerVisualCountdown: 'false',
        victoryEffects: 'true',
      }),
    ).toEqual({
      mode: 'selective',
      timerPulse: false,
      victoryCelebration: true,
      letterPress: true,
      letterFly: true,
    });
  });
});

describe('resolveVisualEffects', () => {
  const selectiveAllOn: VisualEffectsPreferences = {
    mode: 'selective',
    timerPulse: true,
    victoryCelebration: true,
    letterPress: true,
    letterFly: true,
  };

  it('disables all effects in off mode regardless of OS', () => {
    expect(resolveVisualEffects({ ...DEFAULT_VISUAL_EFFECTS, mode: 'off' }, false)).toEqual({
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    });
    expect(resolveVisualEffects({ ...DEFAULT_VISUAL_EFFECTS, mode: 'off' }, true)).toEqual({
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    });
  });

  it('enables all effects in auto mode when OS allows motion', () => {
    expect(resolveVisualEffects(DEFAULT_VISUAL_EFFECTS, false)).toEqual({
      timerPulse: true,
      victoryCelebration: true,
      letterPress: true,
      letterFly: true,
      generalMotion: true,
    });
  });

  it('disables all effects in auto mode when OS reduce motion is on', () => {
    expect(resolveVisualEffects(DEFAULT_VISUAL_EFFECTS, true)).toEqual({
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    });
  });

  it('disables decorative effects while OS reduce motion is unknown', () => {
    expect(resolveVisualEffects(DEFAULT_VISUAL_EFFECTS, null)).toEqual({
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    });
  });

  it('honors selective toggles when OS allows motion', () => {
    expect(
      resolveVisualEffects(
        {
          ...selectiveAllOn,
          timerPulse: false,
          letterFly: false,
        },
        false,
      ),
    ).toEqual({
      timerPulse: false,
      victoryCelebration: true,
      letterPress: true,
      letterFly: false,
      generalMotion: true,
    });
  });

  it('gates selective toggles with OS reduce motion', () => {
    expect(
      resolveVisualEffects(
        {
          ...selectiveAllOn,
          timerPulse: true,
          letterPress: true,
        },
        true,
      ),
    ).toEqual({
      timerPulse: false,
      victoryCelebration: false,
      letterPress: false,
      letterFly: false,
      generalMotion: false,
    });
  });
});
