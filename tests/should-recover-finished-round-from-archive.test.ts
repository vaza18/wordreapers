import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { shouldRecoverFinishedRoundFromArchive } from '../lib/online/frozen-round-view.js';

function session(status: GameSession['status']): GameSession {
  return {
    baseWord: 'тест',
    status,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'a',
    players: {
      a: { name: 'A', wordCount: 0, score: 0 },
    },
  };
}

describe('shouldRecoverFinishedRoundFromArchive', () => {
  it('recovers when the live session is missing', () => {
    expect(shouldRecoverFinishedRoundFromArchive(null)).toBe(true);
    expect(shouldRecoverFinishedRoundFromArchive(undefined)).toBe(true);
  });

  it('recovers during rematch waiting or an in-progress next round', () => {
    expect(shouldRecoverFinishedRoundFromArchive(session('waiting'))).toBe(true);
    expect(shouldRecoverFinishedRoundFromArchive(session('playing'))).toBe(true);
  });

  it('does not recover while the live session is still finished', () => {
    expect(shouldRecoverFinishedRoundFromArchive(session('finished'))).toBe(false);
  });
});
