import { describe, expect, it } from 'vitest';

import { DRAFT_FLY_DURATION_MS } from '../constants/compose-draft.js';

describe('draft letter reveal timing', () => {
  it('uses a single duration for fly move and draft handoff', () => {
    expect(DRAFT_FLY_DURATION_MS).toBeGreaterThan(0);
  });
});
