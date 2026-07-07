import { describe, expect, it } from 'vitest';

import {
  uniqueBonusEnabledForActiveRound,
  uniqueBonusLatchSettingsPatch,
} from '../lib/firebase/session-settings.js';
import type { GameSession } from '../lib/firebase/types.js';

function baseSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      uniqueBonusMode: 'auto',
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0 },
      p1: { name: 'One', wordCount: 0, score: 0 },
    },
    ...overrides,
  };
}

describe('uniqueBonusEnabledForActiveRound', () => {
  it('enables in waiting lobby when roster reaches 3+', () => {
    expect(
      uniqueBonusEnabledForActiveRound({
        status: 'waiting',
        settings: baseSession().settings,
        players: {
          org: { name: 'Org', wordCount: 0, score: 0 },
          p1: { name: 'One', wordCount: 0, score: 0 },
          p2: { name: 'Two', wordCount: 0, score: 0 },
        },
      }),
    ).toBe(true);
  });

  it('returns latch patch when third player joins during playing', () => {
    const session = baseSession({
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        p1: { name: 'One', wordCount: 0, score: 0 },
        joiner: { name: 'Late', wordCount: 0, score: 0 },
      },
    });
    expect(uniqueBonusLatchSettingsPatch(session)?.uniqueBonusEnabled).toBe(true);
  });

  it('does not return latch patch when mode is off', () => {
    const session = baseSession({
      settings: {
        durationSeconds: 600,
        uniqueBonusEnabled: false,
        uniqueBonusMode: 'off',
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        p1: { name: 'One', wordCount: 0, score: 0 },
        joiner: { name: 'Late', wordCount: 0, score: 0 },
      },
    });
    expect(uniqueBonusLatchSettingsPatch(session)).toBeNull();
  });
});
