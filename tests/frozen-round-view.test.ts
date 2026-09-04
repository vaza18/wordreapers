import { describe, expect, it } from 'vitest';

import {
  mergeLiveSessionForResults,
  nextResultsFreezePending,
  resolveResultsDisplayRound,
  resolveResultsErrorCta,
  resolveResultsFreezeSource,
  shouldCloseResultsRematchSurvival,
  shouldFreezeLiveFinishedOnResults,
  shouldKeepFrozenResultsOverLiveFinished,
  shouldLoadViewingRoundFromArchive,
  shouldRecoverFinishedRoundFromArchive,
  isResultsRematchSurvivalActive,
  shouldShowResultsUnavailableAfterRematch,
  shouldUpgradeEmptyResultsFreeze,
  shouldEnableResultsMapsRosterListen,
  computeResultsMapsRosterPlayerIds,
  RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
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

  it('does not freeze from partial provisional-rich words while bootstrap incomplete (C1)', () => {
    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: finished,
      liveWords: new Map([['org', ['а']]]),
      wordsBootstrapComplete: false,
      viewingBaseWordRound: 0,
      pending: null,
    });
    expect(source).toBeNull();
  });

  it('does not latch pending from provisional-rich words before authoritative bootstrap (C1)', () => {
    expect(nextResultsFreezePending(null, finished, new Map([['org', ['а']]]), false)).toBeNull();
  });

  it('keeps prior authoritative pending while bootstrap incomplete (provisional must not shrink pin)', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
    const next = nextResultsFreezePending(pending, finished, new Map([['org', ['а']]]), false);
    expect(next?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('freezes from prior authoritative pending after rematch without re-bootstrap', () => {
    const pending = nextResultsFreezePending(null, finished, words, true);
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

  it('latches rematch survival pending from late authoritative after rematch (not provisional)', () => {
    const waiting = { ...finished, status: 'waiting' as const, baseWordRound: 1 };
    // Provisional-rich while still finished must not pin.
    expect(nextResultsFreezePending(null, finished, words, false)).toBeNull();
    // Rematch before bootstrap: still no pin from provisional words alone.
    expect(nextResultsFreezePending(null, waiting, words, false, finished)).toBeNull();
    // Late authoritative/fetch bootstrap after rematch: latch finished snapshot + words.
    const pending = nextResultsFreezePending(null, waiting, words, true, finished);
    expect(pending?.session.status).toBe('finished');
    expect(pending?.words.get('org')).toEqual(['а', 'б', 'в']);

    const source = resolveResultsFreezeSource({
      hasFrozenRound: false,
      liveSession: waiting,
      liveWords: words,
      wordsBootstrapComplete: true,
      pending,
      viewingBaseWordRound: null,
    });
    expect(source?.session.status).toBe('finished');
    expect(source?.words.get('org')).toEqual(['а', 'б', 'в']);
  });

  it('does not rematch-survival latch when bootstrap follows authoritative empty wipe (C1-residual)', () => {
    const waiting = { ...finished, status: 'waiting' as const, baseWordRound: 1 };
    // After first authoritative {} clears provisional peak, liveWords are empty.
    expect(nextResultsFreezePending(null, waiting, new Map(), true, finished)).toBeNull();
    expect(
      resolveResultsFreezeSource({
        hasFrozenRound: false,
        liveSession: waiting,
        liveWords: new Map(),
        wordsBootstrapComplete: true,
        viewingBaseWordRound: null,
        pending: null,
      }),
    ).toBeNull();
  });

  it('does not latch next-round playing words onto previous finished (C1 cross-round)', () => {
    const waiting = { ...finished, status: 'waiting' as const, baseWordRound: 1 };
    // Rematch wipe: authoritative empty — no latch.
    expect(nextResultsFreezePending(null, waiting, new Map(), true, finished)).toBeNull();

    const playing = { ...finished, status: 'playing' as const, baseWordRound: 1 };
    const nextRoundWords = new Map([['org', ['новий']]]);
    // Survival must not glue new playing words onto the old finished session.
    expect(nextResultsFreezePending(null, playing, nextRoundWords, true, finished)).toBeNull();
    expect(
      resolveResultsFreezeSource({
        hasFrozenRound: false,
        liveSession: playing,
        liveWords: nextRoundWords,
        wordsBootstrapComplete: true,
        viewingBaseWordRound: null,
        pending: null,
      }),
    ).toBeNull();
  });

  it('does not rematch-survival latch when live round jumped past finished+1 (I2)', () => {
    const farWaiting = { ...finished, status: 'waiting' as const, baseWordRound: 3 };
    expect(nextResultsFreezePending(null, farWaiting, words, true, finished)).toBeNull();
  });

  it('keeps rich pending through progressive rematch wipe shrinks (not only empty)', () => {
    const finished = finishedSession();
    const words = new Map([
      ['org', ['а', 'б', 'в']],
      ['p2', ['г', 'д']],
    ]);
    const pending = nextResultsFreezePending(null, finished, words, true);
    expect(pending?.words.get('org')).toEqual(['а', 'б', 'в']);

    const afterShrink = nextResultsFreezePending(
      pending,
      finished,
      new Map([['org', ['а']]]),
      true,
    );
    expect(afterShrink?.words.get('org')).toEqual(['а', 'б', 'в']);
    expect(afterShrink?.words.get('p2')).toEqual(['г', 'д']);

    const afterEmpty = nextResultsFreezePending(afterShrink, finished, new Map(), true);
    expect(afterEmpty?.words.get('org')).toEqual(['а', 'б', 'в']);
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

  it('upgrades incomplete non-empty freeze when live words grow (offline resume)', () => {
    const partial = new Map([['org', ['порт']]]);
    const richer = new Map([
      ['org', ['порт', 'кіт']],
      ['p2', ['ліс']],
    ]);
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: partial,
        nextWords: richer,
        frozenBaseWordRound: 0,
        liveBaseWordRound: 0,
      }),
    ).toBe(true);
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: richer,
        nextWords: partial,
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

describe('shouldEnableResultsMapsRosterListen', () => {
  it('enables before freeze and while freeze is empty (late child upgrade)', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: null,
      }),
    ).toBe(true);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: new Map(),
      }),
    ).toBe(true);
  });

  it('disables after rich freeze (SoT pinned)', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: new Map([['org', ['порт']]]),
      }),
    ).toBe(false);
  });

  it('keeps listening for rich freeze while live finished same round (offline sync)', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: new Map([['org', ['порт']]]),
        liveFinishedSameRound: true,
      }),
    ).toBe(true);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: new Map([['org', ['порт']]]),
        liveFinishedSameRound: false,
      }),
    ).toBe(false);
  });

  it('disables without gameId or empty roster', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: false,
        rosterPlayerIdsLength: 2,
        frozenWords: null,
      }),
    ).toBe(false);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 0,
        frozenWords: null,
      }),
    ).toBe(false);
  });

  it('disables while viewing-pin archive recovery is pending', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: null,
        archiveRecoveryPending: true,
      }),
    ).toBe(false);
  });

  it('enables empty freeze after archive recovery completes', () => {
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: 2,
        frozenWords: new Map(),
        archiveRecoveryPending: false,
      }),
    ).toBe(true);
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
        rematchSurvivalActive: false,
      }),
    ).toBe(true);
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'playing',
        rematchSurvivalActive: false,
      }),
    ).toBe(true);
  });

  it('does not show rematch CTA while survival listen/bootstrap is still active (C2)', () => {
    expect(
      shouldShowResultsUnavailableAfterRematch({
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
        rematchSurvivalActive: true,
      }),
    ).toBe(false);
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

describe('resolveResultsErrorCta', () => {
  const finished = finishedSession();

  it('prefers maps-retry over rematch-home when waiting + mapsUnavailable (C1)', () => {
    expect(
      resolveResultsErrorCta({
        viewingBaseWordRound: null,
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
        freezeAttempted: false,
        lastFinishedCore: finished,
        mapsUnavailable: true,
      }),
    ).toBe('maps-retry');
  });

  it('maps-retry when mapsUnavailable before view is painted', () => {
    expect(
      resolveResultsErrorCta({
        viewingBaseWordRound: null,
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
        freezeAttempted: false,
        lastFinishedCore: finished,
        mapsUnavailable: true,
      }),
    ).toBe('maps-retry');
  });

  it('does not full-screen wipe when mapsUnavailable but results already painted (I1)', () => {
    expect(
      resolveResultsErrorCta({
        viewingBaseWordRound: null,
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: true,
        liveStatus: 'finished',
        freezeAttempted: false,
        lastFinishedCore: finished,
        mapsUnavailable: true,
      }),
    ).toBeNull();
  });

  it('shows rematch-home when rematch advanced without maps failure', () => {
    expect(
      resolveResultsErrorCta({
        viewingBaseWordRound: null,
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
        freezeAttempted: true,
        lastFinishedCore: finished,
        mapsUnavailable: false,
      }),
    ).toBe('rematch-home');
  });

  it('suppresses rematch-home while survival active and maps still loading', () => {
    expect(
      resolveResultsErrorCta({
        viewingBaseWordRound: null,
        hasFrozenRound: false,
        archiveRecoveryPending: false,
        sessionLoaded: true,
        hasFinishedViewData: false,
        liveStatus: 'waiting',
        freezeAttempted: false,
        lastFinishedCore: finished,
        mapsUnavailable: false,
      }),
    ).toBeNull();
  });
});

describe('isResultsRematchSurvivalActive / shouldCloseResultsRematchSurvival', () => {
  const finished = finishedSession();

  it('keeps survival active on rematch waiting until freezeAttempted or mapsUnavailable', () => {
    expect(
      isResultsRematchSurvivalActive({
        freezeAttempted: false,
        lastFinishedCore: finished,
        liveStatus: 'waiting',
        mapsUnavailable: false,
      }),
    ).toBe(true);
    expect(
      isResultsRematchSurvivalActive({
        freezeAttempted: true,
        lastFinishedCore: finished,
        liveStatus: 'waiting',
        mapsUnavailable: false,
      }),
    ).toBe(false);
    expect(
      isResultsRematchSurvivalActive({
        freezeAttempted: false,
        lastFinishedCore: finished,
        liveStatus: 'playing',
        mapsUnavailable: false,
      }),
    ).toBe(false);
    expect(
      isResultsRematchSurvivalActive({
        freezeAttempted: false,
        lastFinishedCore: finished,
        liveStatus: 'waiting',
        mapsUnavailable: true,
      }),
    ).toBe(false);
  });

  it('closes survival after rematch empty authoritative bootstrap with no pending', () => {
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: null,
      }),
    ).toBe(false);
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: 0,
      }),
    ).toBe(false);
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: false,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
      }),
    ).toBe(false);
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map([['org', ['а']]]),
        pending: null,
        emptyBootstrapElapsedMs: RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
      }),
    ).toBe(false);
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
      }),
    ).toBe(true);
  });

  it('empty seal → late child before grace latches pending (C2); true wipe closes after grace', () => {
    const finished = finishedSession();
    const waiting = { ...finished, status: 'waiting' as const, baseWordRound: 1 };
    const rich = new Map([['org', ['порт']]]);

    // Immediate empty seal must not close (late children still possible).
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: 0,
        emptyCloseGraceMs: 1_000,
      }),
    ).toBe(false);

    // Late child upsert after empty seal → latch rematch-survival pending.
    const pending = nextResultsFreezePending(null, waiting, rich, true, finished);
    expect(pending).toEqual({ session: finished, words: rich });
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: rich,
        pending,
        emptyBootstrapElapsedMs: 50,
        emptyCloseGraceMs: 1_000,
      }),
    ).toBe(false);

    // Confirmed wipe: still empty + no pending after grace → close for rematch-home CTA.
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: 1_000,
        emptyCloseGraceMs: 1_000,
      }),
    ).toBe(true);
  });

  it('does not close survival while mapsUnavailable even after grace (I1)', () => {
    expect(
      shouldCloseResultsRematchSurvival({
        freezeAttempted: false,
        hasFrozenRound: false,
        liveStatus: 'waiting',
        wordsBootstrapComplete: true,
        liveWords: new Map(),
        pending: null,
        emptyBootstrapElapsedMs: RESULTS_REMATCH_SURVIVAL_EMPTY_CLOSE_GRACE_MS,
        mapsUnavailable: true,
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

describe('computeResultsMapsRosterPlayerIds', () => {
  const finished = finishedSession();
  const waiting = { ...finished, status: 'waiting' as const, baseWordRound: 1 };
  const finishedIds = Object.keys(finished.players).sort();

  it('returns finished roster while live is finished', () => {
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: finished,
        lastFinishedCore: finished,
        freezeAttempted: false,
      }),
    ).toEqual(finishedIds);
  });

  it('keeps finished roster after empty freeze (late children upgrade path)', () => {
    const emptyFreeze = new Map<string, string[]>();
    const roster = computeResultsMapsRosterPlayerIds({
      frozenWords: emptyFreeze,
      liveSessionCore: finished,
      lastFinishedCore: finished,
      freezeAttempted: true,
    });
    expect(roster).toEqual(finishedIds);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: roster.length,
        frozenWords: emptyFreeze,
      }),
    ).toBe(true);
  });

  it('clears roster after rich freeze (SoT pinned)', () => {
    const richFreeze = new Map([['org', ['порт']]]);
    const roster = computeResultsMapsRosterPlayerIds({
      frozenWords: richFreeze,
      liveSessionCore: finished,
      lastFinishedCore: finished,
      freezeAttempted: true,
    });
    expect(roster).toEqual([]);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: roster.length,
        frozenWords: richFreeze,
      }),
    ).toBe(false);
  });

  it('keeps last finished roster after rematch waiting until freeze attempted', () => {
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: waiting,
        lastFinishedCore: finished,
        freezeAttempted: false,
      }),
    ).toEqual(finishedIds);
  });

  it('stops rematch survival roster once live is playing (C1)', () => {
    const playing = { ...finished, status: 'playing' as const, baseWordRound: 1 };
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: playing,
        lastFinishedCore: finished,
        freezeAttempted: false,
      }),
    ).toEqual([]);
  });

  it('stops rematch survival roster after freeze attempted or rich frozen', () => {
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: waiting,
        lastFinishedCore: finished,
        freezeAttempted: true,
      }),
    ).toEqual([]);
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: new Map([['org', ['порт']]]),
        liveSessionCore: waiting,
        lastFinishedCore: finished,
        freezeAttempted: false,
      }),
    ).toEqual([]);
  });

  it('returns empty when rematch without a preserved finished core', () => {
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: waiting,
        lastFinishedCore: null,
        freezeAttempted: false,
      }),
    ).toEqual([]);
  });

  it('state-driven rematch wiring: finished → waiting keeps roster until freezeAttempted', () => {
    // Mirrors results screen: lastFinishedCore + freezeAttempted in React state (not ref-in-useMemo).
    let lastFinishedCore: typeof finished | null = null;
    let freezeAttempted = false;

    lastFinishedCore = finished;
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: finished,
        lastFinishedCore,
        freezeAttempted,
      }),
    ).toEqual(finishedIds);

    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: waiting,
        lastFinishedCore,
        freezeAttempted,
      }),
    ).toEqual(finishedIds);

    freezeAttempted = true;
    expect(
      computeResultsMapsRosterPlayerIds({
        frozenWords: null,
        liveSessionCore: waiting,
        lastFinishedCore,
        freezeAttempted,
      }),
    ).toEqual([]);
  });

  it('empty freeze + late rich liveWords: upgrade gate still open', () => {
    const emptyFreeze = new Map<string, string[]>();
    const lateWords = new Map([['org', ['порт']]]);
    expect(
      shouldUpgradeEmptyResultsFreeze({
        frozenWords: emptyFreeze,
        nextWords: lateWords,
        frozenBaseWordRound: 0,
        liveBaseWordRound: 0,
      }),
    ).toBe(true);
    const roster = computeResultsMapsRosterPlayerIds({
      frozenWords: emptyFreeze,
      liveSessionCore: finished,
      lastFinishedCore: finished,
      freezeAttempted: true,
    });
    expect(roster.length).toBeGreaterThan(0);
    expect(
      shouldEnableResultsMapsRosterListen({
        hasGameId: true,
        rosterPlayerIdsLength: roster.length,
        frozenWords: emptyFreeze,
      }),
    ).toBe(true);
  });
});
