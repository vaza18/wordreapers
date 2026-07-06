import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolveLobbyScreenActions } from '../lib/online/live-round-screen-actions.js';

function playingSession(
  players: GameSession['players'],
  liveRoundPlayerUids: string[] = ['org'],
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    baseWordRound: 1,
    liveRoundPlayerUids,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
  };
}

function shouldLobbyAutoJoinLiveRound(session: GameSession, myUid: string): boolean {
  const actions = resolveLobbyScreenActions({ session, myUid });
  return actions.shouldNavigateToPlay || actions.shouldAutoJoinLiveRound;
}

describe('resolveLobbyScreenActions auto-join', () => {
  it('is true when already active in the live round', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    });
    expect(shouldLobbyAutoJoinLiveRound(session, 'org')).toBe(true);
  });

  it('is false for roster members not in the current round', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p3: { name: 'Three', wordCount: 0, score: 0, online: false },
    });
    expect(shouldLobbyAutoJoinLiveRound(session, 'p3')).toBe(false);
  });

  it('offers reconnect rejoin for offline same-round participants', () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 1, score: 1, online: false },
      },
      ['org', 'p2'],
    );
    expect(shouldLobbyAutoJoinLiveRound(session, 'p2')).toBe(true);
  });
});
