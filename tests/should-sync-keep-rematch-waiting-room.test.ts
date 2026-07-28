import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { shouldSyncKeepRematchWaitingRoom } from '../lib/online/should-sync-keep-rematch-waiting-room.js';

function rematchWaiting(
  players: GameSession['players'],
  extras: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: '',
    status: 'waiting',
    timerEndsAt: null,
    organizerId: 'org',
    baseWordRound: 2,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    players,
    ...extras,
  };
}

describe('shouldSyncKeepRematchWaitingRoom', () => {
  it('keeps rematch when the first rematcher alone still has a durable latch', () => {
    const session = rematchWaiting(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
      },
      { resultsExitedBy: { org: true }, baseWordPickerUid: 'org' },
    );
    expect(shouldSyncKeepRematchWaitingRoom(session)).toBe(true);
  });

  it('keeps rematch when offline peer holds only the picker seat (no latch)', () => {
    const session = rematchWaiting(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
      },
      { baseWordPickerUid: 'peer' },
    );
    expect(shouldSyncKeepRematchWaitingRoom(session)).toBe(true);
  });

  it('does not keep round-0 waiting', () => {
    const session = rematchWaiting(
      { org: { name: 'Org', wordCount: 0, score: 0, online: false } },
      { baseWordRound: 0, resultsExitedBy: { org: true } },
    );
    expect(shouldSyncKeepRematchWaitingRoom(session)).toBe(false);
  });

  it('does not keep rematch when durable opt-in players have left', () => {
    const session = rematchWaiting(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        peer: { name: 'Peer', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
      { resultsExitedBy: { org: true, peer: true } },
    );
    expect(shouldSyncKeepRematchWaitingRoom(session)).toBe(false);
  });
});
