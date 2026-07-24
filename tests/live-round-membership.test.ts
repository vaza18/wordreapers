import { describe, expect, it } from 'vitest';

import {
  hasMultiplayerRound,
  hasOptedIntoNextRound,
  isActiveLivePlayer,
  rematchWaitingPlayerPatch,
} from '../lib/online/presence/live-round-membership.js';
import { finishedSession, gameSession } from './helpers/game-session-fixtures.js';

describe('isActiveLivePlayer', () => {
  it('requires playing status and online presence', () => {
    expect(isActiveLivePlayer(gameSession({}), 'org')).toBe(true);
    expect(isActiveLivePlayer(gameSession({}), 'p1')).toBe(false);
    expect(isActiveLivePlayer(gameSession({ status: 'finished' }), 'org')).toBe(false);
    expect(isActiveLivePlayer(null, 'org')).toBe(false);
  });

  it('excludes players who voluntarily left (offline with hasLeft)', () => {
    expect(
      isActiveLivePlayer(
        gameSession({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
          },
        }),
        'org',
      ),
    ).toBe(false);
  });

  it('includes stale hasLeft when player is still online', () => {
    expect(
      isActiveLivePlayer(
        gameSession({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true, hasLeft: true },
          },
          liveRoundPlayerUids: ['org'],
        }),
        'org',
      ),
    ).toBe(true);
  });

  it('excludes online roster member not in liveRoundPlayerUids', () => {
    expect(
      isActiveLivePlayer(
        gameSession({
          baseWordRound: 2,
          liveRoundPlayerUids: ['org'],
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p3: { name: 'Three', wordCount: 0, score: 0, online: true },
          },
        }),
        'p3',
      ),
    ).toBe(false);
  });
});

describe('hasOptedIntoNextRound', () => {
  it('includes the actor and players who left results via Play again', () => {
    const session = finishedSession({ org: true, p2: true });
    expect(hasOptedIntoNextRound(session, 'org', 'org')).toBe(true);
    expect(hasOptedIntoNextRound(session, 'p2', 'org')).toBe(true);
    expect(hasOptedIntoNextRound(session, 'p3', 'org')).toBe(false);
  });
});

describe('rematchWaitingPlayerPatch', () => {
  it('keeps only rematch participants online', () => {
    const session = finishedSession({ org: true });
    expect(rematchWaitingPlayerPatch(session, 'org', 'org')).toEqual({
      score: 0,
      wordCount: 0,
      online: true,
      hasLeft: false,
    });
    expect(rematchWaitingPlayerPatch(session, 'p3', 'org')).toEqual({
      score: 0,
      wordCount: 0,
      online: false,
      hasLeft: false,
    });
  });
});

describe('hasMultiplayerRound', () => {
  it('is false for round 1 with only the organizer in roster', () => {
    expect(
      hasMultiplayerRound(
        gameSession({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
          },
        }),
        'org',
      ),
    ).toBe(false);
  });

  it('stays true after another player leaves round 1', () => {
    expect(
      hasMultiplayerRound(
        gameSession({
          players: {
            org: { name: 'Org', wordCount: 1, score: 1, online: true },
            guest: {
              name: 'Guest',
              wordCount: 1,
              score: 1,
              online: false,
              hasLeft: true,
            },
          },
        }),
        'org',
      ),
    ).toBe(true);
  });

  it('uses liveRoundPlayerUids for rematch rounds', () => {
    expect(
      hasMultiplayerRound(
        gameSession({
          baseWordRound: 1,
          liveRoundPlayerUids: ['org'],
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            passive: { name: 'Passive', wordCount: 0, score: 0, online: false },
          },
        }),
        'org',
      ),
    ).toBe(false);
    expect(
      hasMultiplayerRound(
        gameSession({
          baseWordRound: 1,
          liveRoundPlayerUids: ['org'],
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            joiner: { name: 'Joiner', wordCount: 0, score: 0, online: true },
          },
        }),
        'org',
      ),
    ).toBe(true);
    expect(
      hasMultiplayerRound(
        gameSession({
          baseWordRound: 1,
          liveRoundPlayerUids: ['org', 'p2'],
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p2: { name: 'P2', wordCount: 0, score: 0, online: false, hasLeft: true },
            passive: { name: 'Passive', wordCount: 0, score: 0, online: false },
          },
        }),
        'org',
      ),
    ).toBe(true);
  });

  it('treats offline peer who already scored this rematch round as multipplayer (WAGTJ)', () => {
    expect(
      hasMultiplayerRound(
        gameSession({
          baseWordRound: 2,
          liveRoundPlayerUids: ['org'],
          players: {
            org: { name: 'Org', wordCount: 1, score: 1, online: true },
            peer: { name: 'Peer', wordCount: 1, score: 1, online: false },
          },
        }),
        'org',
      ),
    ).toBe(true);
  });
});
