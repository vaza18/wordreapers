import { describe, expect, it } from 'vitest';

import {
  resolveLeftRoundDisplaySession,
  resolveLeftRoundResultsBaseWordRound,
  shouldAcceptLeftRoundFrozenArchive,
  shouldLoadLeftRoundFinishedArchive,
  shouldShowLeftRoundViewResults,
} from '../lib/online/left-round-screen-actions.js';

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
});
