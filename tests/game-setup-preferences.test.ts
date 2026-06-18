import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GAME_SETUP_PREFERENCES,
  parseGameSetupPreferences,
} from '../lib/settings/game-setup-preferences.js';

describe('parseGameSetupPreferences', () => {
  it('returns defaults when storage is empty', () => {
    expect(parseGameSetupPreferences(null)).toEqual(DEFAULT_GAME_SETUP_PREFERENCES);
  });

  it('restores saved organizer choices', () => {
    const raw = JSON.stringify({
      durationMinutes: 15,
      uniqueBonusMode: 'off',
      allowProperNouns: true,
      allowSlang: true,
    });
    expect(parseGameSetupPreferences(raw)).toEqual({
      durationMinutes: 15,
      uniqueBonusMode: 'off',
      allowProperNouns: true,
      allowSlang: true,
    });
  });

  it('restores auto bonus mode', () => {
    const raw = JSON.stringify({ uniqueBonusMode: 'auto' });
    expect(parseGameSetupPreferences(raw).uniqueBonusMode).toBe('auto');
  });

  it('clamps duration to supported range', () => {
    const raw = JSON.stringify({ durationMinutes: 99 });
    expect(parseGameSetupPreferences(raw).durationMinutes).toBe(20);
  });
});
