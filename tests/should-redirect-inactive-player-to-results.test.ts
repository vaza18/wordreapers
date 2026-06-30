import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolvePlayScreenActions } from '../lib/online/live-round-screen-actions.js';

const playingSession = (
  players: GameSession['players'],
  extra: Partial<Pick<GameSession, 'liveRoundPlayerUids'>> = {},
): Pick<GameSession, 'status' | 'baseWordRound' | 'liveRoundPlayerUids' | 'players'> => ({
  status: 'playing',
  baseWordRound: 3,
  liveRoundPlayerUids: ['org'],
  players,
  ...extra,
});

function shouldRedirectInactivePlayerToResults(
  session: Pick<GameSession, 'status' | 'baseWordRound' | 'liveRoundPlayerUids' | 'players'>,
  myUid: string,
  roundEnded: boolean,
  endedBaseWordRound: number | null | undefined,
): boolean {
  return resolvePlayScreenActions({
    session,
    myUid,
    roundEnded,
    frozenBaseWordRound: endedBaseWordRound,
    leavingIntentionally: false,
  }).shouldRedirectToResults;
}

describe('resolvePlayScreenActions.shouldRedirectToResults', () => {
  it('returns false while player is still offline after rejoin (stale snapshot)', () => {
    expect(
      shouldRedirectInactivePlayerToResults(
        playingSession({
          org: { name: 'Org', online: false, hasLeft: true, score: 0, wordCount: 0 },
        }),
        'org',
        false,
        null,
      ),
    ).toBe(false);
  });

  it('returns false while player is online but hasLeft is still true', () => {
    expect(
      shouldRedirectInactivePlayerToResults(
        playingSession({
          org: { name: 'Org', online: true, hasLeft: true, score: 0, wordCount: 0 },
        }),
        'org',
        false,
        null,
      ),
    ).toBe(false);
  });

  it('returns false for active live participant', () => {
    expect(
      shouldRedirectInactivePlayerToResults(
        playingSession({
          org: { name: 'Org', online: true, hasLeft: false, score: 0, wordCount: 0 },
        }),
        'org',
        false,
        null,
      ),
    ).toBe(false);
  });

  it('returns true for online roster member not in liveRoundPlayerUids', () => {
    expect(
      shouldRedirectInactivePlayerToResults(
        playingSession(
          {
            p3: { name: 'Three', online: true, hasLeft: false, score: 4, wordCount: 3 },
          },
          { liveRoundPlayerUids: ['org'] },
        ),
        'p3',
        false,
        null,
      ),
    ).toBe(true);
  });

  it('returns false while reviewing a frozen prior round on play', () => {
    expect(
      shouldRedirectInactivePlayerToResults(
        playingSession({
          org: { name: 'Org', online: true, hasLeft: false, score: 4, wordCount: 3 },
        }),
        'org',
        true,
        2,
      ),
    ).toBe(false);
  });
});
