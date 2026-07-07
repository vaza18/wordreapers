import { describe, expect, it } from 'vitest';

import { resolveGameSessionSettingsForSession } from '../lib/firebase/session-settings.js';
import type { GameSession } from '../lib/firebase/types.js';
import { currentBaseWordPickerUid } from '../lib/online/base-word-picker.js';
import {
  assertActiveLivePlayerVoteEligibility,
  assertBaseWordPickerEligibility,
  assertLobbyVisiblePlayerState,
  assertPresenceOfflineOnPriorRoundView,
  assertRematchBootstrapSessionShape,
  assertRematchWaitingPlayerPatch,
  assertUniqueBonusRoundLatch,
  shouldAssertOnlineInvariants,
} from '../lib/online/invariants.js';
import { resolveResultsPresence } from '../lib/online/live-round-screen-actions.js';
import {
  hasOptedIntoNextRound,
  isActiveLivePlayer,
  isExpectedLiveRoundParticipant,
  rematchWaitingPlayerPatch,
} from '../lib/online/presence/live-round-membership.js';
import { resolvePostJoinRoute } from '../lib/online/post-join-route.js';
import { shouldToastRosterPlayerJoined } from '../lib/online/play-toast-events.js';
import {
  isLobbyVisiblePlayer,
  isRematchWaitingLobby,
} from '../lib/online/rematch/rematch-waiting-lobby.js';
import { resolveRoundEndSessionSnapshot } from '../lib/online/session/resolve-round-end-session-snapshot.js';
import {
  shouldKeepFrozenResultsOverLiveFinished,
  shouldRecoverFinishedRoundFromArchive,
} from '../lib/online/session/frozen-round-view.js';
import { isEarlyFinishVoteRequired } from '../lib/online/voting/early-finish-vote.js';
import {
  finishedSession,
  playingSession,
  sessionWithPlayers,
} from './helpers/game-session-fixtures.js';

describe('online invariants (canonical spec)', () => {
  it('runs assertions in test environment', () => {
    expect(shouldAssertOnlineInvariants()).toBe(true);
  });

  describe('§1 opt-in rematch', () => {
    it('tracks opt-in via resultsExitedBy and actorUid', () => {
      const session = finishedSession({ p2: true });
      expect(hasOptedIntoNextRound(session, 'org', 'org')).toBe(true);
      expect(hasOptedIntoNextRound(session, 'p2')).toBe(true);
      expect(hasOptedIntoNextRound(session, 'p3')).toBe(false);
    });

    it('rematch waiting patch keeps non-opt-in offline without hasLeft', () => {
      const session = finishedSession({ p2: true });
      expect(rematchWaitingPlayerPatch(session, 'p2', 'org')).toEqual({
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

    it('rejects invalid rematch waiting player patches', () => {
      expect(() =>
        assertRematchWaitingPlayerPatch('a', true, { online: false, hasLeft: false }),
      ).toThrow(/opted-in player must be online/);
      expect(() =>
        assertRematchWaitingPlayerPatch('b', false, { online: true, hasLeft: false }),
      ).toThrow(/non-opt-in player must be offline/);
    });

    it('validates rematch bootstrap session shape', () => {
      expect(() =>
        assertRematchBootstrapSessionShape({
          status: 'waiting',
          baseWord: '',
          timerEndsAt: null,
          organizerId: 'org',
          settings: {
            durationSeconds: 300,
            uniqueBonusEnabled: false,
            language: 'uk',
            allowProperNouns: false,
            allowSlang: false,
          },
          players: {},
        }),
      ).not.toThrow();
    });
  });

  describe('§2 navigation', () => {
    it('routes passive roster members on playing to results, not play', () => {
      const route = resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            passive: { name: 'Passive', wordCount: 0, score: 0, online: false },
          },
          {
            status: 'playing',
            baseWordRound: 1,
            liveRoundPlayerUids: ['org'],
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'passive',
        'ROOM1',
      );
      expect(route.pathname).toBe('/online/results/[gameId]');
    });
  });

  describe('§3 rematch waiting lobby', () => {
    it('detects rematch waiting lobby for round 2+', () => {
      expect(isRematchWaitingLobby({ status: 'waiting', baseWordRound: 1 })).toBe(true);
      expect(isRematchWaitingLobby({ status: 'waiting', baseWordRound: 0 })).toBe(false);
    });

    it('hides hasLeft players from lobby list', () => {
      const session = sessionWithPlayers(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          left: { name: 'Left', wordCount: 0, score: 0, online: true, hasLeft: true },
        },
        { status: 'waiting', baseWordRound: 1, resultsExitedBy: { org: true } },
      );
      expect(isLobbyVisiblePlayer(session, 'left')).toBe(false);
      expect(() =>
        assertLobbyVisiblePlayerState(
          'left',
          { name: 'Left', wordCount: 0, score: 0, hasLeft: true },
          true,
        ),
      ).toThrow(/hasLeft players must not be visible/);
    });
  });

  describe('§4 base-word picker', () => {
    it('picker must be online and not left', () => {
      expect(() =>
        assertBaseWordPickerEligibility('p', { name: 'P', wordCount: 0, score: 0, online: true }),
      ).not.toThrow();
      expect(() =>
        assertBaseWordPickerEligibility('p', {
          name: 'P',
          wordCount: 0,
          score: 0,
          online: false,
        }),
      ).toThrow(/must be online/);
    });

    it('round 1 picker is first eligible in join order', () => {
      const session = sessionWithPlayers(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
        { status: 'waiting', baseWordRound: 0, baseWordPickerOrder: ['org', 'guest'] },
      );
      expect(currentBaseWordPickerUid(session)).toBe('org');
    });
  });

  describe('§5 active live-round membership', () => {
    it('requires online + liveRoundPlayerUids for round 2+', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          ghost: { name: 'Ghost', wordCount: 0, score: 0, online: true },
        },
        { baseWordRound: 1, liveRoundPlayerUids: ['org'] },
      );
      expect(isActiveLivePlayer(session, 'org')).toBe(true);
      expect(isActiveLivePlayer(session, 'ghost')).toBe(false);
    });

    it('treats stale hasLeft as active when online', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true, hasLeft: true },
        },
        { baseWordRound: 0 },
      );
      expect(isActiveLivePlayer(session, 'org')).toBe(true);
    });

    it('expected live-round participants include briefly offline roster members', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
        },
        { baseWordRound: 1, liveRoundPlayerUids: ['org', 'peer'] },
      );
      expect(isExpectedLiveRoundParticipant(session, 'peer')).toBe(true);
    });
  });

  describe('§6 voting during playing', () => {
    it('proposer is not a required voter', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: true },
        },
        { baseWordRound: 0 },
      );
      expect(isEarlyFinishVoteRequired(session, 'org', 'org')).toBe(false);
      expect(isEarlyFinishVoteRequired(session, 'peer', 'org')).toBe(true);
      expect(() => assertActiveLivePlayerVoteEligibility(session, 'org', 'org')).toThrow(
        /proposer must not be a required voter/,
      );
    });
  });

  describe('§7 presence', () => {
    it('does not toast player_joined for lobby presence sync at round start', () => {
      const prev = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: false },
        },
        { baseWordRound: 1, liveRoundPlayerUids: ['org', 'peer'] },
      );
      const curr = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          peer: { name: 'Peer', wordCount: 0, score: 0, online: true },
        },
        { baseWordRound: 1, liveRoundPlayerUids: ['org', 'peer'] },
      );
      expect(shouldToastRosterPlayerJoined(prev, curr, 'peer')).toBe(false);
    });

    it('marks offline when viewing prior round while live advanced', () => {
      expect(
        resolveResultsPresence({
          liveSession: { status: 'playing', baseWordRound: 2 },
          frozenBaseWordRound: 1,
        }),
      ).toBe(true);
      expect(() => assertPresenceOfflineOnPriorRoundView(1, 2, false)).toThrow(/must mark offline/);
    });
  });

  describe('§8 frozen round / archive', () => {
    it('keeps frozen snapshot when live round advances', () => {
      expect(shouldKeepFrozenResultsOverLiveFinished(1, 2)).toBe(true);
      const frozen = finishedSession();
      const live = { ...finishedSession(), baseWordRound: 1, status: 'finished' as const };
      expect(resolveRoundEndSessionSnapshot(frozen, live)).toBe(frozen);
    });

    it('recovers finished round from archive when live is waiting/playing', () => {
      expect(shouldRecoverFinishedRoundFromArchive({ status: 'waiting' } as GameSession)).toBe(
        true,
      );
      expect(shouldRecoverFinishedRoundFromArchive({ status: 'finished' } as GameSession)).toBe(
        false,
      );
    });
  });

  describe('§ unique bonus auto latch', () => {
    it('enables x2 when roster reaches 3+ during playing with auto mode', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: true },
          b: { name: 'B', wordCount: 0, score: 0, online: true },
        },
        {
          settings: {
            durationSeconds: 300,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: false,
            language: 'uk',
            allowProperNouns: false,
            allowSlang: false,
          },
        },
      );
      const resolved = resolveGameSessionSettingsForSession(session);
      expect(resolved.uniqueBonusEnabled).toBe(true);
      expect(() => assertUniqueBonusRoundLatch(session, resolved)).not.toThrow();
    });

    it('keeps x2 latched when roster drops below 3 during playing', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: true },
        },
        {
          settings: {
            durationSeconds: 300,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: true,
            language: 'uk',
            allowProperNouns: false,
            allowSlang: false,
          },
        },
      );
      const resolved = resolveGameSessionSettingsForSession(session);
      expect(resolved.uniqueBonusEnabled).toBe(true);
    });

    it('rejects turning x2 off mid-round once latched', () => {
      const session = playingSession(
        {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
        },
        {
          settings: {
            durationSeconds: 300,
            uniqueBonusMode: 'auto',
            uniqueBonusEnabled: true,
            language: 'uk',
            allowProperNouns: false,
            allowSlang: false,
          },
        },
      );
      expect(() =>
        assertUniqueBonusRoundLatch(session, {
          durationSeconds: 300,
          uniqueBonusMode: 'auto',
          uniqueBonusEnabled: false,
          language: 'uk',
          allowProperNouns: false,
          allowSlang: false,
        }),
      ).toThrow(/cannot turn off mid-round/);
    });
  });
});
