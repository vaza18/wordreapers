import { describe, expect, it } from 'vitest';

import {
  shouldFreezeLiveFinishedOnResults,
  shouldKeepFrozenResultsOverLiveFinished,
  shouldLoadViewingRoundFromArchive,
  shouldRecoverFinishedRoundFromArchive,
} from '../lib/online/session/frozen-round-view.js';
import { gameSession, sessionWithRound } from './helpers/game-session-fixtures.js';

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

  it('skips archive load when viewing matches live finished round', () => {
    expect(shouldLoadViewingRoundFromArchive(1, sessionWithRound('finished', 1))).toBe(false);
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
});
