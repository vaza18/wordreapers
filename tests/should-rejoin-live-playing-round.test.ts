import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolvePlayScreenActions } from '../lib/online/live-round-screen-actions.js';

function playingSession(
  baseWordRound: number,
  players: GameSession['players'],
  liveRoundPlayerUids: string[] = ['org', 'p2'],
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    baseWordRound,
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

function shouldRejoin(
  session: GameSession,
  myUid: string,
  roundEnded: boolean,
  frozenBaseWordRound: number | null | undefined,
): boolean {
  return resolvePlayScreenActions({
    session,
    myUid,
    roundEnded,
    frozenBaseWordRound,
    leavingIntentionally: false,
  }).shouldRejoin;
}

describe('resolvePlayScreenActions.shouldRejoin', () => {
  it('is false while reviewing a prior round on play screen', () => {
    const session = playingSession(1, {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p3: { name: 'Three', wordCount: 8, score: 8, online: false },
    });
    expect(shouldRejoin(session, 'p3', true, 0)).toBe(false);
  });

  it('is true for an offline active-round participant who disconnected briefly', () => {
    const session = playingSession(1, {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 2, score: 2, online: false },
    });
    expect(shouldRejoin(session, 'p2', false, 1)).toBe(true);
  });

  it('is true for offline late joiner in liveRoundPlayerUids before first word', () => {
    const session = playingSession(1, {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: false },
    });
    expect(shouldRejoin(session, 'p2', false, 1)).toBe(true);
  });

  it('is false for offline roster member not in the live round', () => {
    const session = playingSession(
      1,
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 8, score: 8, online: false },
      },
      ['org'],
    );
    expect(shouldRejoin(session, 'p3', false, 1)).toBe(false);
  });
});
