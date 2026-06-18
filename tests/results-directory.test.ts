import { describe, expect, it } from 'vitest';

import { createSoloResultsDirectory } from '../lib/game/results-directory.js';

describe('createSoloResultsDirectory', () => {
  it('resolves the solo player id to the profile name', () => {
    const directory = createSoloResultsDirectory('Василь', 2, 'm');
    expect(directory.getName('solo')).toBe('Василь');
    expect(directory.getAvatarColorIndex('solo')).toBe(2);
    expect(directory.getGender('solo')).toBe('m');
  });
});
