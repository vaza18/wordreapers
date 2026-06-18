import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  archiveRouteKey,
  parseArchiveRouteKey,
  playingRoundSnapshotFromSession,
} from '../lib/online/online-session-archive.js';

function session(status: GameSession['status'], timerEndsAt: number | null): GameSession {
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
    timerEndsAt,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
    baseWordRound: 0,
  };
}

describe('archive route keys', () => {
  it('round-trips game id and base word round', () => {
    expect(archiveRouteKey('2abc', 2)).toBe('2ABC--2');
    expect(parseArchiveRouteKey('2ABC--2')).toEqual({ gameId: '2ABC', baseWordRound: 2 });
  });

  it('rejects malformed keys', () => {
    expect(parseArchiveRouteKey('no-separator')).toBeNull();
    expect(parseArchiveRouteKey('abcd--nope')).toBeNull();
  });
});

describe('playingRoundSnapshotFromSession', () => {
  it('captures a playing snapshot while the timer runs', () => {
    const snap = playingRoundSnapshotFromSession(session('playing', Date.now() + 60_000));
    expect(snap?.baseWord).toBe('тест');
    expect(snap?.timerEndsAt).toBeGreaterThan(Date.now());
    expect(snap?.players.org?.name).toBe('Org');
    expect(snap?.organizerId).toBe('org');
  });

  it('returns null outside playing', () => {
    expect(playingRoundSnapshotFromSession(session('finished', null))).toBeNull();
    expect(playingRoundSnapshotFromSession(session('playing', null))).toBeNull();
  });
});
