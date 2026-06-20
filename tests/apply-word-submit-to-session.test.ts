import { describe, expect, it } from 'vitest';

import { applyWordSubmitToSession } from '../lib/online/apply-word-submit-to-session.js';
import type { GameSession } from '../lib/firebase/types.js';

function playingSession(overrides?: Partial<GameSession>): GameSession {
  return {
    timerEndsAt: Date.now() + 600_000,
    organizerId: 'org',
    status: 'playing',
    baseWord: 'кропивницька',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: true,
      uniqueBonusMode: 'auto',
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    players: {
      p1: { name: 'A', score: 0, wordCount: 0, avatarColorIndex: 0, online: true },
      p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
    },
    wordFirst: {},
    wordPlayers: {},
    ...overrides,
  };
}

describe('applyWordSubmitToSession', () => {
  it('scores first unique word with x2 when bonus is on', () => {
    const session = playingSession();
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entry.points).toBe(2);
    expect(result.entry.badge).toBe('x2');
    expect(result.session.players.p1?.score).toBe(2);
    expect(result.session.players.p1?.wordCount).toBe(1);
    expect(result.session.wordPlayers?.порт?.p1).toBe(true);
  });

  it('rejects duplicate submission from same player', () => {
    const session = playingSession({
      wordFirst: { порт: 'p1' },
      wordPlayers: { порт: { p1: true } },
      players: {
        p1: { name: 'A', score: 2, wordCount: 1, avatarColorIndex: 0, online: true },
        p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
      },
    });
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('rejects when session is not playing', () => {
    const session = playingSession({ status: 'finished' });
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'NOT_PLAYING' });
  });
});
