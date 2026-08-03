import { describe, expect, it } from 'vitest';

import { shouldHealPlayUiOnAppState } from '@/lib/game/compose-resume-heal';

describe('shouldHealPlayUiOnAppState', () => {
  it('heals only on foreground active', () => {
    expect(shouldHealPlayUiOnAppState('active')).toBe(true);
    expect(shouldHealPlayUiOnAppState('inactive')).toBe(false);
    expect(shouldHealPlayUiOnAppState('background')).toBe(false);
  });
});
