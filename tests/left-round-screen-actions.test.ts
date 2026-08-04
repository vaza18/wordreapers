import { describe, expect, it } from 'vitest';

import {
  resolveLeftRoundDisplaySession,
  resolveLeftRoundResultsBaseWordRound,
  resolveLeftWordsSnapshot,
  nextLeftAtAfterResumePointer,
  nextLeftAtBaseWordRound,
  shouldAcceptLeftRoundFrozenArchive,
  shouldBlockLeftRoundOnMapsBootstrap,
  shouldFreezeLeftRoundFromPlayingSnapshot,
  shouldLoadLeftRoundFinishedArchive,
  shouldPromoteLeftPlayingSnapshotFallback,
  shouldShowLeftMapsRetryCta,
  shouldShowLeftMapsSyncBanner,
  shouldShowLeftRoundViewResults,
} from '../lib/online/left-round-screen-actions.js';

describe('shouldBlockLeftRoundOnMapsBootstrap', () => {
  it('spins only while bootstrap incomplete and maps still available', () => {
    expect(
      shouldBlockLeftRoundOnMapsBootstrap({
        wordsBootstrapComplete: false,
        mapsUnavailable: false,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
      }),
    ).toBe(true);
  });

  it('does not spin forever when mapsUnavailable (fail-loud CTA instead)', () => {
    expect(
      shouldBlockLeftRoundOnMapsBootstrap({
        wordsBootstrapComplete: false,
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
      }),
    ).toBe(false);
  });

  it('does not spin when words already painted during post-paint Retry', () => {
    expect(
      shouldBlockLeftRoundOnMapsBootstrap({
        wordsBootstrapComplete: false,
        mapsUnavailable: false,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasPaintedWords: true,
      }),
    ).toBe(false);
  });

  it('does not block once bootstrap complete or frozen', () => {
    expect(
      shouldBlockLeftRoundOnMapsBootstrap({
        wordsBootstrapComplete: true,
        mapsUnavailable: false,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockLeftRoundOnMapsBootstrap({
        wordsBootstrapComplete: false,
        mapsUnavailable: false,
        hasPinnedFrozenRound: true,
        roundStillActive: true,
      }),
    ).toBe(false);
  });
});

describe('shouldShowLeftMapsRetryCta', () => {
  it('shows full-screen CTA only before view is painted', () => {
    expect(
      shouldShowLeftMapsRetryCta({
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasViewData: false,
      }),
    ).toBe(true);
  });

  it('does not full-screen wipe when left view already painted (I1)', () => {
    expect(
      shouldShowLeftMapsRetryCta({
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasViewData: true,
      }),
    ).toBe(false);
  });

  it('hides CTA when frozen or round not active', () => {
    expect(
      shouldShowLeftMapsRetryCta({
        mapsUnavailable: true,
        hasPinnedFrozenRound: true,
        roundStillActive: true,
        hasViewData: false,
      }),
    ).toBe(false);
    expect(
      shouldShowLeftMapsRetryCta({
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: false,
        hasViewData: false,
      }),
    ).toBe(false);
  });
});

describe('shouldShowLeftMapsSyncBanner', () => {
  it('shows banner when mapsUnavailable over painted left view', () => {
    expect(
      shouldShowLeftMapsSyncBanner({
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasViewData: true,
      }),
    ).toBe(true);
  });

  it('hides banner when no view / not unavailable', () => {
    expect(
      shouldShowLeftMapsSyncBanner({
        mapsUnavailable: true,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasViewData: false,
      }),
    ).toBe(false);
    expect(
      shouldShowLeftMapsSyncBanner({
        mapsUnavailable: false,
        hasPinnedFrozenRound: false,
        roundStillActive: true,
        hasViewData: true,
      }),
    ).toBe(false);
  });
});

describe('shouldShowLeftRoundViewResults', () => {
  it('shows rejoin path only while the live round is still playing', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: true,
        displaySessionStatus: 'playing',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'playing', baseWordRound: 2 },
      }),
    ).toBe(false);
  });

  it('shows when the live session is still finished', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: false,
        displaySessionStatus: 'finished',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'finished', baseWordRound: 2 },
      }),
    ).toBe(true);
  });

  it('shows when rematch waiting lobby opened after the viewer left round 2', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: false,
        displaySessionStatus: 'finished',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'waiting', baseWordRound: 3 },
      }),
    ).toBe(true);
  });

  it('shows when rematch started before frozen snapshot loaded on the left screen', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: false,
        displaySessionStatus: 'waiting',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'waiting', baseWordRound: 3 },
      }),
    ).toBe(true);
  });

  it('does not show while the same round is still live', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: false,
        displaySessionStatus: 'waiting',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'waiting', baseWordRound: 2 },
      }),
    ).toBe(false);
  });

  it('shows when a later round is already playing', () => {
    expect(
      shouldShowLeftRoundViewResults({
        roundStillActive: false,
        displaySessionStatus: 'playing',
        leftAtBaseWordRound: 2,
        liveSession: { status: 'playing', baseWordRound: 3 },
      }),
    ).toBe(true);
  });
});

describe('resolveLeftRoundResultsBaseWordRound', () => {
  it('always pins navigation to the round the viewer left', () => {
    expect(resolveLeftRoundResultsBaseWordRound(1, 2)).toBe(2);
    expect(resolveLeftRoundResultsBaseWordRound(undefined, 2)).toBe(2);
  });
});

describe('shouldAcceptLeftRoundFrozenArchive', () => {
  it('rejects archives from another round', () => {
    expect(shouldAcceptLeftRoundFrozenArchive(1, 2)).toBe(false);
    expect(shouldAcceptLeftRoundFrozenArchive(2, 2)).toBe(true);
  });
});

describe('shouldLoadLeftRoundFinishedArchive', () => {
  it('loads when rematch advanced past the left round', () => {
    expect(
      shouldLoadLeftRoundFinishedArchive(2, { status: 'waiting', baseWordRound: 3 }, false),
    ).toBe(true);
  });

  it('skips while the same round is still playing', () => {
    expect(
      shouldLoadLeftRoundFinishedArchive(2, { status: 'playing', baseWordRound: 2 }, false),
    ).toBe(false);
  });

  it('loads when a later round is already playing', () => {
    expect(
      shouldLoadLeftRoundFinishedArchive(2, { status: 'playing', baseWordRound: 3 }, false),
    ).toBe(true);
  });
});

describe('resolveLeftWordsSnapshot', () => {
  const rich = new Map([['org', ['порт']]]);
  const empty = new Map<string, string[]>();

  it('uses live words while the left round is still playing', () => {
    expect(
      resolveLeftWordsSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'playing', baseWordRound: 2 },
        liveWords: rich,
        playingSnapshot: null,
        pinnedFrozenWords: null,
      }),
    ).toBe(rich);
  });

  it('keeps playing-snapshot words when finished clears live roster hook', () => {
    expect(
      resolveLeftWordsSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'finished', baseWordRound: 2 },
        liveWords: empty,
        playingSnapshot: {
          session: { baseWordRound: 2 },
          words: rich,
        },
        pinnedFrozenWords: null,
      }),
    ).toBe(rich);
  });

  it('prefers pinned frozen words over live/snapshot', () => {
    const frozen = new Map([['org', ['топ']]]);
    expect(
      resolveLeftWordsSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'finished', baseWordRound: 2 },
        liveWords: empty,
        playingSnapshot: {
          session: { baseWordRound: 2 },
          words: rich,
        },
        pinnedFrozenWords: frozen,
      }),
    ).toBe(frozen);
  });

  it('does not fall through to live words from a later rematch round', () => {
    const laterRoundWords = new Map([['org', ['новий']]]);
    expect(
      resolveLeftWordsSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'finished', baseWordRound: 3 },
        liveWords: laterRoundWords,
        playingSnapshot: null,
        pinnedFrozenWords: null,
      }),
    ).toEqual(empty);
  });
});

describe('resolveLeftRoundDisplaySession', () => {
  const leftRoundSession = {
    baseWord: 'нектарність',
    status: 'playing' as const,
    baseWordRound: 2,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk' as const,
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: 1,
    organizerId: 'org',
    players: {},
  };
  const staleArchiveSession = { ...leftRoundSession, baseWord: 'широкине', baseWordRound: 1 };
  const rematchSession = { ...leftRoundSession, status: 'waiting' as const, baseWordRound: 3 };

  it('prefers the playing snapshot over a stale archive from another round', () => {
    expect(
      resolveLeftRoundDisplaySession({
        leftAtBaseWordRound: 2,
        liveSession: rematchSession,
        pinnedFrozenSession: staleArchiveSession,
        playingSnapshotSession: leftRoundSession,
      })?.baseWord,
    ).toBe('нектарність');
  });

  it('uses the pinned archive when it matches the left round', () => {
    expect(
      resolveLeftRoundDisplaySession({
        leftAtBaseWordRound: 2,
        liveSession: rematchSession,
        pinnedFrozenSession: { ...leftRoundSession, status: 'finished' },
        playingSnapshotSession: leftRoundSession,
      })?.status,
    ).toBe('finished');
  });

  it('does not fall through to a later live rematch session', () => {
    expect(
      resolveLeftRoundDisplaySession({
        leftAtBaseWordRound: 2,
        liveSession: { ...rematchSession, status: 'finished', baseWordRound: 3 },
        pinnedFrozenSession: null,
        playingSnapshotSession: null,
      }),
    ).toBeUndefined();
  });
});

describe('shouldFreezeLeftRoundFromPlayingSnapshot', () => {
  it('promotes the playing snapshot after rematch advances past the left round', () => {
    expect(
      shouldFreezeLeftRoundFromPlayingSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'playing', baseWordRound: 3 },
        hasPinnedFrozen: false,
        playingSnapshotBaseWordRound: 2,
      }),
    ).toBe(true);
  });

  it('skips when archive already pinned or snapshot round mismatches', () => {
    expect(
      shouldFreezeLeftRoundFromPlayingSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'waiting', baseWordRound: 3 },
        hasPinnedFrozen: true,
        playingSnapshotBaseWordRound: 2,
      }),
    ).toBe(false);
    expect(
      shouldFreezeLeftRoundFromPlayingSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'waiting', baseWordRound: 3 },
        hasPinnedFrozen: false,
        playingSnapshotBaseWordRound: 1,
      }),
    ).toBe(false);
  });

  it('does not promote an empty playing-snapshot word list', () => {
    expect(
      shouldFreezeLeftRoundFromPlayingSnapshot({
        leftAtBaseWordRound: 2,
        liveSession: { status: 'finished', baseWordRound: 2 },
        hasPinnedFrozen: false,
        playingSnapshotBaseWordRound: 2,
        playingSnapshotHasWords: false,
      }),
    ).toBe(false);
  });
});

describe('shouldPromoteLeftPlayingSnapshotFallback', () => {
  it('allows fallback only when the snapshot has words', () => {
    expect(shouldPromoteLeftPlayingSnapshotFallback(new Map())).toBe(false);
    expect(shouldPromoteLeftPlayingSnapshotFallback(new Map([['org', []]]))).toBe(false);
    expect(shouldPromoteLeftPlayingSnapshotFallback(new Map([['org', ['порт']]]))).toBe(true);
  });
});

describe('nextLeftAtBaseWordRound', () => {
  it('adopts the live playing round on a fresh leave', () => {
    expect(
      nextLeftAtBaseWordRound({
        previous: null,
        previousSource: 'none',
        liveStatus: 'playing',
        liveRound: 6,
      }),
    ).toEqual({ round: 6, source: 'live' });
  });

  it('pins resume N when cold-start has resume and live is already playing N+1', () => {
    expect(
      nextLeftAtBaseWordRound({
        previous: null,
        previousSource: 'none',
        liveStatus: 'playing',
        liveRound: 6,
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });

  it('keeps a resume pin when rematch starts a newer round while parked on left', () => {
    expect(
      nextLeftAtBaseWordRound({
        previous: 4,
        previousSource: 'resume',
        liveStatus: 'playing',
        liveRound: 6,
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });

  it('keeps a live pin when rematch starts a newer round while parked on left', () => {
    expect(
      nextLeftAtBaseWordRound({
        previous: 4,
        previousSource: 'live',
        liveStatus: 'playing',
        liveRound: 6,
      }),
    ).toEqual({ round: 4, source: 'live' });
  });

  it('applies resume when live is already past the left round (finished/waiting)', () => {
    expect(
      nextLeftAtBaseWordRound({
        previous: null,
        previousSource: 'none',
        liveStatus: 'waiting',
        liveRound: 6,
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });
});

describe('nextLeftAtAfterResumePointer', () => {
  it('applies resume when pin is still empty', () => {
    expect(
      nextLeftAtAfterResumePointer({
        previous: null,
        previousSource: 'none',
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });

  it('replaces a newer live pin when AsyncStorage resume arrives late', () => {
    expect(
      nextLeftAtAfterResumePointer({
        previous: 6,
        previousSource: 'live',
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });

  it('keeps an existing resume pin', () => {
    expect(
      nextLeftAtAfterResumePointer({
        previous: 4,
        previousSource: 'resume',
        resumeRound: 4,
      }),
    ).toEqual({ round: 4, source: 'resume' });
  });
});
