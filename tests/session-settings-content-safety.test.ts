import { describe, expect, it } from 'vitest';

import { resolveGameSessionSettingsForSession } from '../lib/firebase/session-settings.js';
import type { GameSession } from '../lib/firebase/types.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'портрет',
    status: 'waiting',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: true,
      allowSlang: true,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0 },
      guest: { name: 'Guest', wordCount: 0, score: 0, joinedVia: 'browse' },
    },
    ...overrides,
  };
}

describe('resolveGameSessionSettingsForSession content safety', () => {
  it('forces dictionary flags off after browse join', () => {
    const resolved = resolveGameSessionSettingsForSession(session());
    expect(resolved.allowProperNouns).toBe(false);
    expect(resolved.allowSlang).toBe(false);
  });

  it('keeps invite-only room dictionary flags', () => {
    const resolved = resolveGameSessionSettingsForSession(
      session({
        players: {
          org: { name: 'Org', wordCount: 0, score: 0 },
          guest: { name: 'Guest', wordCount: 0, score: 0, joinedVia: 'invite' },
        },
      }),
    );
    expect(resolved.allowProperNouns).toBe(true);
    expect(resolved.allowSlang).toBe(true);
  });
});
