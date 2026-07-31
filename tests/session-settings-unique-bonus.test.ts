import { describe, expect, it } from 'vitest';

import {
  uniqueBonusEnabledForActiveRound,
  uniqueBonusLatchSettingsPatch,
  playerCountForUniqueBonus,
} from '../lib/firebase/session-settings.js';
import { resolveRoundStartSettings } from '../lib/online/start-game-session-write.js';
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

  it('disables in waiting lobby when visible roster drops below 3 after a voluntary leave', () => {
    expect(
      uniqueBonusEnabledForActiveRound({
        status: 'waiting',
        settings: {
          ...baseSession().settings!,
          uniqueBonusEnabled: true,
          uniqueBonusMode: 'auto',
        },
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p1: { name: 'One', wordCount: 0, score: 0, online: true },
          left: { name: 'Left', wordCount: 0, score: 0, online: false, hasLeft: true },
        },
      }),
    ).toBe(false);
  });

  it('counts only lobby-visible players for waiting unique-bonus threshold', () => {
    expect(
      playerCountForUniqueBonus({
        status: 'waiting',
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p1: { name: 'One', wordCount: 0, score: 0, online: true },
          left: { name: 'Left', wordCount: 0, score: 0, online: false, hasLeft: true },
        },
      }),
    ).toBe(2);
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

  it('counts only liveRoundPlayerUids for rematch rounds', () => {
    const session = baseSession({
      baseWordRound: 1,
      liveRoundPlayerUids: ['org', 'p1'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        p1: { name: 'One', wordCount: 0, score: 0 },
        p2: { name: 'Two', wordCount: 8, score: 8, online: false },
      },
    });
    expect(playerCountForUniqueBonus(session)).toBe(2);
    expect(uniqueBonusEnabledForActiveRound(session)).toBe(false);
    expect(uniqueBonusLatchSettingsPatch(session)).toBeNull();
  });

  it('latches x2 when third player joins live rematch round', () => {
    const session = baseSession({
      baseWordRound: 1,
      liveRoundPlayerUids: ['org', 'p1', 'joiner'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        p1: { name: 'One', wordCount: 0, score: 0 },
        joiner: { name: 'Late', wordCount: 0, score: 0 },
        p2: { name: 'Passive', wordCount: 8, score: 8, online: false },
      },
    });
    expect(playerCountForUniqueBonus(session)).toBe(3);
    expect(uniqueBonusLatchSettingsPatch(session)?.uniqueBonusEnabled).toBe(true);
  });
});

describe('resolveRoundStartSettings unique bonus', () => {
  it('disables auto x2 at start when visible waiting roster is below 3 after leave', () => {
    const session = baseSession({
      status: 'waiting',
      settings: {
        durationSeconds: 600,
        uniqueBonusEnabled: true,
        uniqueBonusMode: 'auto',
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p1: { name: 'One', wordCount: 0, score: 0, online: true },
        left: { name: 'Left', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
    });
    expect(resolveRoundStartSettings(session).uniqueBonusEnabled).toBe(false);
  });
});
