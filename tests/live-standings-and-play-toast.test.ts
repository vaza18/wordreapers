import { describe, expect, it } from 'vitest';

import { formatPlayToastEvent } from '../lib/online/format-play-toast.js';
import {
  liveScoreForPlayer,
  sessionPlayerScoresMatchWordMaps,
} from '../lib/online/live-standings.js';
import { playingSession } from './helpers/game-session-fixtures.js';

describe('live-standings', () => {
  it('derives live score from word maps', () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      {
        wordPlayers: { порт: { org: true } },
        wordFirst: { порт: 'org' },
      },
    );

    expect(liveScoreForPlayer(session, 'org')).toBeGreaterThan(0);
    expect(sessionPlayerScoresMatchWordMaps(session)).toBe(false);
  });
});

describe('format-play-toast', () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key;

  it('formats invite join toasts with inviter name', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      guest: {
        name: 'Guest',
        wordCount: 0,
        score: 0,
        online: true,
        invitedBy: 'org',
      },
    });

    const message = formatPlayToastEvent(
      t,
      { type: 'player_joined', playerId: 'guest', name: 'Guest', gender: 'f' },
      null,
      session,
      'viewer',
    );

    expect(message).toContain('game.toastPlayerJoinedInvite');
    expect(message).toContain('Org');
  });
});
