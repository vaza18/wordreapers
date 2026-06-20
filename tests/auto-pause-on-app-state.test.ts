import { describe, expect, it } from 'vitest';

import { shouldTriggerAutoPause } from '../lib/game/auto-pause-on-app-state.js';

describe('shouldTriggerAutoPause', () => {
  it('triggers on background while playing', () => {
    expect(shouldTriggerAutoPause('background', true)).toBe(true);
  });

  it('does not trigger when not playing', () => {
    expect(shouldTriggerAutoPause('background', false)).toBe(false);
  });

  it('does not trigger on active or inactive', () => {
    expect(shouldTriggerAutoPause('active', true)).toBe(false);
    expect(shouldTriggerAutoPause('inactive', true)).toBe(false);
  });
});
