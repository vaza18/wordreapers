import { describe, expect, it } from 'vitest';

import type { GameSessionSnapshot } from '../lib/firebase/game-session-service.js';
import {
  claimPlayRouteNavigation,
  consumePlaySessionBootstrap,
  mergePlaySessionSubscription,
  resetPlayRouteNavigationClaims,
  seedPlaySessionBootstrap,
} from '../lib/online/session/play-session-bootstrap.js';

function snapshot(
  status: GameSessionSnapshot['status'],
  extra: Partial<GameSessionSnapshot> = {},
): GameSessionSnapshot {
  return {
    id: 'ABCDE',
    baseWord: 'тест',
    status,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: status === 'playing' ? Date.now() + 60_000 : null,
    organizerId: 'org',
    players: { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
    ...extra,
  };
}

describe('play-session-bootstrap', () => {
  it('seeds and consumes snapshot once for the target room', () => {
    resetPlayRouteNavigationClaims();
    const playing = snapshot('playing');
    seedPlaySessionBootstrap(playing);
    expect(consumePlaySessionBootstrap('ABCDE')).toEqual(playing);
    expect(consumePlaySessionBootstrap('ABCDE')).toBeNull();
  });

  it('ignores consume for a different room', () => {
    resetPlayRouteNavigationClaims();
    seedPlaySessionBootstrap(snapshot('playing'));
    expect(consumePlaySessionBootstrap('OTHER')).toBeNull();
  });

  it('claims play navigation once per live round key', () => {
    resetPlayRouteNavigationClaims();
    const playing = snapshot('playing');
    expect(claimPlayRouteNavigation('ABCDE', playing)).toBe(true);
    expect(claimPlayRouteNavigation('ABCDE', playing)).toBe(false);
    const nextRound = snapshot('playing', { baseWordRound: 1, timerEndsAt: Date.now() + 120_000 });
    expect(claimPlayRouteNavigation('ABCDE', nextRound)).toBe(true);
  });
});

describe('mergePlaySessionSubscription', () => {
  it('keeps playing snapshot when stale waiting cache arrives', () => {
    const playing = snapshot('playing');
    const staleWaiting = snapshot('waiting', { timerEndsAt: null });
    expect(mergePlaySessionSubscription(playing, staleWaiting)).toBe(playing);
  });

  it('accepts forward transition to playing', () => {
    const waiting = snapshot('waiting', { timerEndsAt: null });
    const playing = snapshot('playing');
    expect(mergePlaySessionSubscription(waiting, playing)).toEqual(playing);
  });
});
