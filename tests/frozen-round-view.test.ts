import { describe, expect, it } from 'vitest';

import {
  mergeLiveSessionForResults,
  nextResultsFreezePending,
  resolveResultsDisplayRound,
  resolveResultsFreezeSource,
  shouldFreezeLiveFinishedOnResults,
  shouldKeepFrozenResultsOverLiveFinished,
  shouldLoadViewingRoundFromArchive,
  shouldRecoverFinishedRoundFromArchive,
  shouldShowResultsUnavailableAfterRematch,
  shouldUpgradeEmptyResultsFreeze,
} from '../lib/online/session/frozen-round-view.js';
import { finishedSession, gameSession, sessionWithRound } from './helpers/game-session-fixtures.js';

describe('shouldFreezeLiveFinishedOnResults', () => {
  it('allows freezing when viewing the same or a later round', () => {
    expect(shouldFreezeLiveFinishedOnResults(1, null)).toBe(true);
    expect(shouldFreezeLiveFinishedOnResults(1, 1)).toBe(true);
    expect(shouldFreezeLiveFinishedOnResults(1, 2)).toBe(true);
  });

  it('blocks freezing live when viewing an earlier round', () => {
    expect(shouldFreezeLiveFinishedOnResults(1, 0)).toBe(false);
    expect(shouldFreezeLiveFinishedOnResults(2, 1)).toBe(false);
  });
});

describe('resolveResultsFreezeSource rematch-before-freeze', () => {
  const finished = finishedSession();
  const words = new Map([
    ['org', ['а', 'б', 'в']],
    ['p2', ['г', 'д']],
    ['p3', ['е']],
  ]);

  it('freezes from pending when rematch leaves finished before freeze effect', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
    expect(pending).not.toBeNull();

    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: { ...finished, status: 'waiting', baseWordRound: 1 },
      liveWords: new Map(),
      wordsBootstrapComplete: true,
      viewingBaseWordRound: 0,
      pending,
    });
    expect(source?.session.status).toBe('finished');
    expect(source?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('freezes from live finished when words are ready', () => {
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: finished,
      liveWords: words,
      wordsBootstrapComplete: true,
      viewingBaseWordRound: 0,
      pending: null,
    });
    expect(source?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('does not freeze live finished when bootstrap is incomplete (stale-empty first paint)', () => {
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: finished,
      liveWords: new Map(),
      wordsBootstrapComplete: false,
      viewingBaseWordRound: 0,
      pending: null,
    });
    expect(source).toBeNull();
  });

  it('keeps rich pending when live words empty after bootstrap', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
    const next = nextResultsFreezePending(pending, finished, new Map(), true);
    expect(next?.words.get('org')).toEqual(['а', 'б', 'в']);
    expect(next?.session.baseWordRound ?? 0).toBe(finished.baseWordRound ?? 0);
  });

  it('does not glue prior-round pending words onto a later finished session', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
    const laterFinished = { ...finished, baseWordRound: 1 };
    const next = nextResultsFreezePending(pending, laterFinished, new Map(), true);
    expect(next?.session.baseWordRound).toBe(1);
    expect(next?.words.size ?? 0).toBe(0);
    expect(next?.words.get('org')).toBeUndefined();
  });

  it('latches rich pending before bootstrap so rematch can still freeze', () => {
    const pending = nextResultsFreezePending(null, finished, words, false);
    expect(pending?.words.get('org')).toEqual(['а', 'б', 'в']);

    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: { ...finished, status: 'waiting', baseWordRound: 1 },
      liveWords: new Map(),
      wordsBootstrapComplete: false,
      viewingBaseWordRound: null,
      pending,
    });
    expect(source?.session.status).toBe('finished');
    expect(source?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('does not latch empty pending before bootstrap', () => {
    expect(nextResultsFreezePending(null, finished, new Map(), false)).toBeNull();
  });

  it('freezes rich pending words while live is still finished with empty liveWords', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: finished,
      liveWords: new Map(),
      wordsBootstrapComplete: true,
      viewingBaseWordRound: 0,
      pending,
    });
    expect(source?.session.status).toBe('finished');
    expect(source?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('does not freeze empty words when live wordPlayers claim words and no rich pending', () => {
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: {
        ...finished,
        wordPlayers: { а: { org: true }, б: { org: true }, в: { org: true } },
      },
      liveWords: new Map(),
      wordsBootstrapComplete: true,
      viewingBaseWordRound: 0,
      pending: null,
    });
    expect(source).toBeNull();
  });

  it('allows authoritative empty freeze when maps claim nothing (true zero-word round)', () => {
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: { ...finished, wordPlayers: {} },
      liveWords: new Map(),
      wordsBootstrapComplete: true,
      viewingBaseWordRound: 0,
      pending: null,
    });
    expect(source?.words.size ?? 0).toBe(0);
  });

  it('upgrades empty freeze when richer live words arrive for the same round', () => {
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: new Map(),
        nextWords: words,
        frozenBaseWordRound: 0,
        liveBaseWordRound: 0,
      }),
    ).toBe(true);
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: words,
        nextWords: new Map(),
        frozenBaseWordRound: 0,
        liveBaseWordRound: 0,
      }),
    ).toBe(false);
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: words,
        nextWords: words,
        frozenBaseWordRound: 0,
        liveBaseWordRound: 0,
      }),
    ).toBe(false);
  });

  it('does not upgrade empty freeze with a later finished round words', () => {
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: new Map(),
        nextWords: words,
        frozenBaseWordRound: 1,
        liveBaseWordRound: 2,
      }),
    ).toBe(false);
  });

  it('does not upgrade when viewing pin differs from live finished round', () => {
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: new Map(),
        nextWords: words,
        frozenBaseWordRound: 2,
        liveBaseWordRound: 2,
        viewingBaseWordRound: 1,
      }),
    ).toBe(false);
  });
});

describe('shouldShowResultsUnavailableAfterRematch', () => {
  it('shows error when rematch advanced with no freeze, archive, or finished view', () => {
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
      }),
    ).toBe(true);
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'playing',
      }),
    ).toBe(true);
  });

  it('does not show error while still finished, recovering, or already frozen', () => {
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'finished',
      }),
    ).toBe(false);
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: true,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
      }),
    ).toBe(false);
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: true,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
      }),
    ).toBe(false);
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: true,
        liveStatus: 'waiting',
      }),
    ).toBe(false);
  });
});

describe('shouldKeepFrozenResultsOverLiveFinished', () => {
  it('keeps round 1 results when round 2 finishes elsewhere', () => {
    expect(shouldKeepFrozenResultsOverLiveFinished(0, 1)).toBe(true);
    expect(shouldKeepFrozenResultsOverLiveFinished(1, 2)).toBe(true);
  });

  it('does not block syncing the same finished round', () => {
    expect(shouldKeepFrozenResultsOverLiveFinished(1, 1)).toBe(false);
  });
});

describe('shouldLoadViewingRoundFromArchive', () => {
  it('loads a pinned round while live advanced or absent', () => {
    expect(shouldLoadViewingRoundFromArchive(0, null)).toBe(true);
    expect(shouldLoadViewingRoundFromArchive(0, sessionWithRound('playing', 1))).toBe(true);
    expect(shouldLoadViewingRoundFromArchive(0, sessionWithRound('finished', 1))).toBe(true);
  });

  it('loads pinned archive even when live finished matches the viewing round', () => {
    // Rematch may deny/clear live session_word_maps; navigate-to-results archive is source of truth.
    expect(shouldLoadViewingRoundFromArchive(1, sessionWithRound('finished', 1))).toBe(true);
    expect(shouldLoadViewingRoundFromArchive(null, sessionWithRound('finished', 1))).toBe(false);
  });
});

describe('shouldRecoverFinishedRoundFromArchive', () => {
  it('recovers when the live session is missing', () => {
    expect(shouldRecoverFinishedRoundFromArchive(null)).toBe(true);
    expect(shouldRecoverFinishedRoundFromArchive(undefined)).toBe(true);
  });

  it('recovers during rematch waiting or an in-progress next round', () => {
    expect(shouldRecoverFinishedRoundFromArchive(gameSession({ status: 'waiting' }))).toBe(true);
    expect(shouldRecoverFinishedRoundFromArchive(gameSession({ status: 'playing' }))).toBe(true);
  });

  it('does not recover while the live session is still finished', () => {
    expect(shouldRecoverFinishedRoundFromArchive(gameSession({ status: 'finished' }))).toBe(false);
  });

  it('skips prior-archive recovery for join-into-playing without a pinned viewing round', () => {
    expect(
      shouldRecoverFinishedRoundFromArchive(gameSession({ status: 'playing' }), {
        fromJoinIntoPlaying: true,
      }),
    ).toBe(false);
    expect(
      shouldRecoverFinishedRoundFromArchive(gameSession({ status: 'waiting' }), {
        fromJoinIntoPlaying: true,
      }),
    ).toBe(true);
  });
});

describe('resolveResultsDisplayRound', () => {
  it('uses frozen round when present', () => {
    const frozenSession = sessionWithRound('finished', 1);
    const frozenWords = new Map([['org', ['а']]]);
    const display = resolveResultsDisplayRound({
      frozenRound: { session: frozenSession, words: frozenWords },
      liveSession: sessionWithRound('finished', 2),
      liveWords: new Map([['org', ['б']]]),
      viewingBaseWordRound: 1,
    });
    expect(display?.session.baseWordRound).toBe(1);
    expect(display?.words.get('org')).toEqual(['а']);
  });

  it('does not show a later live finished round when viewing an earlier pin', () => {
    expect(
      resolveResultsDisplayRound({
        frozenRound: null,
        liveSession: sessionWithRound('finished', 2),
        liveWords: new Map([['org', ['б']]]),
        viewingBaseWordRound: 1,
      }),
    ).toBeNull();
  });

  it('allows live finished when it matches the viewing pin', () => {
    const live = sessionWithRound('finished', 1);
    const words = new Map([['org', ['а']]]);
    expect(
      resolveResultsDisplayRound({
        frozenRound: null,
        liveSession: live,
        liveWords: words,
        viewingBaseWordRound: 1,
      }),
    ).toEqual({ session: live, words });
  });
});

describe('mergeLiveSessionForResults', () => {
  it('merges maps while the finished round is still live', () => {
    const core = { ...gameSession({ status: 'finished' }), id: 'ABCDE' };
    const merged = mergeLiveSessionForResults(
      core,
      { wordPlayers: { порт: { org: true } } },
      false,
    );
    expect(merged?.wordPlayers).toEqual({ порт: { org: true } });
  });

  it('does not merge stale maps onto rematch core after freeze', () => {
    const core = { ...gameSession({ status: 'waiting' }), id: 'ABCDE' };
    const merged = mergeLiveSessionForResults(core, { wordPlayers: { порт: { org: true } } }, true);
    expect(merged).toBe(core);
    expect(merged?.wordPlayers).toBeUndefined();
  });
});
