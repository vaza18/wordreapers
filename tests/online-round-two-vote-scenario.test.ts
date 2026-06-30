import { describe, expect, it } from 'vitest';

import type { GameSession, SessionVote } from '../lib/firebase/types.js';
import {
  buildEarlyFinishParticipantRows,
  earlyFinishRequiredVoterIds,
} from '../lib/online/early-finish-vote.js';
import { hasOnlineOpponent } from '../lib/online/session-presence.js';
import { buildPlayersPatchForRoundStart } from '../lib/online/players-patch-for-round-start.js';
import { isLiveParticipant, waitingLobbyOptInUids } from '../lib/online/live-round-membership.js';
import {
  resolveLobbyScreenActions,
  resolvePlayScreenActions,
} from '../lib/online/live-round-screen-actions.js';

const settings: GameSession['settings'] = {
  durationSeconds: 300,
  uniqueBonusEnabled: false,
  language: 'uk',
  allowProperNouns: false,
  allowSlang: false,
};

/** Rematch waiting: org + p1 opted in; p3 still on round-1 play with stale RTDB counters. */
function rematchWaitingLobby(): GameSession {
  return {
    baseWord: 'підкрилля',
    status: 'waiting',
    timerEndsAt: null,
    organizerId: 'org',
    baseWordRound: 1,
    baseWordPickerOrder: ['org', 'p1', 'p3'],
    baseWordPickerUid: 'p1',
    settings,
    players: {
      org: { name: 'Василь', wordCount: 0, score: 0, online: true },
      p1: { name: 'iPad 13 Pro', wordCount: 0, score: 0, online: true },
      p3: { name: 'Василь 7', wordCount: 8, score: 8, online: false },
    },
  };
}

function applyRoundStartPatch(session: GameSession): GameSession {
  const patch = buildPlayersPatchForRoundStart(session);
  const players = { ...session.players };
  for (const [uid, fields] of Object.entries(patch)) {
    players[uid] = { ...players[uid], ...fields };
  }
  const now = Date.now();
  return {
    ...session,
    status: 'playing',
    players,
    liveRoundPlayerUids: waitingLobbyOptInUids(session),
    timerEndsAt: now + settings.durationSeconds * 1000,
    roundStartedAt: now,
    roundTimerBudgetSeconds: settings.durationSeconds,
  };
}

const earlyVote: SessionVote = {
  proposedBy: 'org',
  proposedAt: Date.now(),
  votes: { org: 'yes' },
};

describe('round two early-finish scenario (3 players, p3 skips rematch)', () => {
  const waiting = rematchWaitingLobby();
  const playing = applyRoundStartPatch(waiting);

  it('clears stale counters for non-participant at round start', () => {
    expect(buildPlayersPatchForRoundStart(waiting).p3).toEqual({
      score: 0,
      wordCount: 0,
      online: false,
    });
    expect(playing.players.p3).toMatchObject({ score: 0, wordCount: 0, online: false });
  });

  it('keeps only org and p1 as live-round participants', () => {
    expect(isLiveParticipant(playing, 'p3')).toBe(false);
    expect(isLiveParticipant(playing, 'p1')).toBe(true);
  });

  it('requires early-finish vote only from p1 when org proposes', () => {
    expect(earlyFinishRequiredVoterIds(playing, 'org').sort()).toEqual(['p1']);
  });

  it('lists only proposer and required voter in the vote modal', () => {
    const rows = buildEarlyFinishParticipantRows(playing, earlyVote, 'org');
    expect(rows.map((row) => row.playerId).sort()).toEqual(['org', 'p1']);
    expect(rows.find((row) => row.playerId === 'p1')?.voteStatus).toBe('pending');
  });

  it('counts only p1 as online opponent for solo-vs-vote menu', () => {
    expect(hasOnlineOpponent(playing, 'org')).toBe(true);
    expect(hasOnlineOpponent(playing, 'p1')).toBe(true);
  });

  it('excludes p3 from vote when stale online on prior-round results', () => {
    const staleOnlinePlaying: GameSession = {
      ...playing,
      players: {
        ...playing.players,
        p3: { ...playing.players.p3, online: true },
      },
    };
    expect(earlyFinishRequiredVoterIds(staleOnlinePlaying, 'org').sort()).toEqual(['p1']);
    expect(isLiveParticipant(staleOnlinePlaying, 'p3')).toBe(false);
  });

  it('blocks p3 from auto-rejoin on play and lobby', () => {
    expect(
      resolvePlayScreenActions({
        session: playing,
        myUid: 'p3',
        roundEnded: true,
        frozenBaseWordRound: 0,
        leavingIntentionally: false,
      }).shouldRejoin,
    ).toBe(false);
    const lobby = resolveLobbyScreenActions({ session: playing, myUid: 'p3' });
    expect(lobby.shouldNavigateToPlay || lobby.shouldAutoJoinLiveRound).toBe(false);
  });
});
