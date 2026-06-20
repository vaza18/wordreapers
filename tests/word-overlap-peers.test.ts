import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  overlapPeersFromSession,
  overlapPeersFromWordMap,
} from '../lib/game/word-overlap-peers.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Орг', wordCount: 1, score: 1, avatarColorIndex: 0 },
      a: { name: 'Аня', wordCount: 1, score: 1, avatarColorIndex: 1 },
      b: { name: 'Богдан', wordCount: 1, score: 1, avatarColorIndex: 2 },
    },
    ...overrides,
  };
}

describe('overlapPeersFromSession', () => {
  it('returns other players from wordPlayers map', () => {
    const s = session({
      wordPlayers: {
        рот: { org: true, a: true, b: true },
      },
    });
    const peers = overlapPeersFromSession('рот', s, 'org');
    expect(peers.map((peer) => peer.playerId)).toEqual(['a', 'b']);
    expect(peers[0]?.name).toBe('Аня');
  });

  it('returns empty when wordPlayers entry is missing', () => {
    const s = session({
      wordFirst: { рот: 'a' },
    });
    expect(overlapPeersFromSession('рот', s, 'org')).toEqual([]);
  });
});

describe('overlapPeersFromWordMap', () => {
  it('lists other players with the same normalized word', () => {
    const wordsByPlayer = new Map([
      ['p1', ['рот', 'тор']],
      ['p2', ['рот']],
      ['p3', ['рот']],
    ]);
    const peers = overlapPeersFromWordMap(
      'рот',
      'p1',
      wordsByPlayer,
      (id) => (id === 'p2' ? 'Аня' : 'Богдан'),
      (id) => (id === 'p2' ? 1 : 2),
    );
    expect(peers.map((peer) => peer.name)).toEqual(['Аня', 'Богдан']);
  });
});
