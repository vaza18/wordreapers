import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolveGameSessionSettings } from '../lib/firebase/session-settings.js';
import { buildRematchWaitingSession } from '../lib/online/rematch/build-rematch-waiting-session.js';

describe('bootstrap rematch waiting session shape', () => {
  it('resets scores and clears round fields without player_words restore', () => {
    const finished: GameSession = {
      baseWord: 'альт',
      status: 'finished',
      settings: {
        durationSeconds: 300,
        uniqueBonusEnabled: true,
        language: 'uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: 1_700_000_000_000,
      organizerId: 'org',
      baseWordRound: 2,
      players: {
        org: { name: 'Org', wordCount: 5, score: 12, online: true },
        guest: { name: 'Guest', wordCount: 3, score: 8, online: false },
      },
      wordPlayers: { тест: { org: true } },
      purgeAfterAt: 1_800_000_000_000,
      resultsExitedBy: { org: true },
    };

    const waiting = buildRematchWaitingSession(finished);
    expect(waiting.status).toBe('waiting');
    expect(waiting.baseWord).toBe('');
    expect(waiting.baseWordRound).toBe(3);
    expect(waiting.players.org?.score).toBe(0);
    expect(waiting.players.guest?.wordCount).toBe(0);
    expect(waiting.wordPlayers).toBeUndefined();
    expect(waiting.purgeAfterAt).toBeUndefined();
    expect(waiting.resultsExitedBy).toBeUndefined();
  });

  it('synthesizes organizer roster entry when missing from archived players', () => {
    const finished: GameSession = {
      baseWord: 'альт',
      status: 'finished',
      settings: {
        durationSeconds: 300,
        uniqueBonusEnabled: false,
        language: 'uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: null,
      organizerId: 'org',
      baseWordRound: 1,
      players: {
        guest: { name: 'Guest', wordCount: 2, score: 4, online: false },
      },
    };

    const waiting = buildRematchWaitingSession(finished);
    expect(waiting.players.org).toEqual({
      name: 'Organizer',
      wordCount: 0,
      score: 0,
      online: false,
      hasLeft: true,
    });
  });
});

describe('resolveGameSessionSettings', () => {
  it('fills missing settings fields required by RTDB rules', () => {
    const resolved = resolveGameSessionSettings({
      durationSeconds: 120,
      uniqueBonusEnabled: false,
    } as GameSession['settings']);
    expect(resolved.language).toBe('uk-uk');
    expect(typeof resolved.allowProperNouns).toBe('boolean');
    expect(typeof resolved.allowSlang).toBe('boolean');
  });

  it('preserves auto mode when bonus is off for small roster', () => {
    const resolved = resolveGameSessionSettings(
      {
        durationSeconds: 600,
        uniqueBonusEnabled: false,
        uniqueBonusMode: 'auto',
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      2,
    );
    expect(resolved.uniqueBonusMode).toBe('auto');
    expect(resolved.uniqueBonusEnabled).toBe(false);
  });

  it('enables bonus for auto mode with three or more players', () => {
    const resolved = resolveGameSessionSettings(
      {
        durationSeconds: 600,
        uniqueBonusEnabled: false,
        uniqueBonusMode: 'auto',
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      3,
    );
    expect(resolved.uniqueBonusMode).toBe('auto');
    expect(resolved.uniqueBonusEnabled).toBe(true);
  });
});
