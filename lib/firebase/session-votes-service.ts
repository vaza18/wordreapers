import { get } from 'firebase/database';

import { runRtdbTransaction } from './rtdb-transaction.js';

import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  earlyFinishRequiredVoterIds,
  earlyFinishVoteExpired,
  shouldFinishFromEarlyVote,
} from '../online/voting/early-finish-vote.js';
import {
  computeExtendedTimerEndsAt,
  shouldApplyAddTimeFromVote,
  shouldClearAddTimeVote,
} from '../online/voting/add-time-vote.js';
import { shouldActivatePauseFromVote } from '../online/voting/pause-vote.js';
import { resumeVoteRequiredIds, shouldResumeFromVote } from '../online/voting/resume-vote.js';
import { isFirebaseIgnorableRtdbError } from './rtdb-errors.js';
import { computePurgeAfterAt } from './session-purge.js';
import { getServerNow } from './server-clock.js';
import {
  computeRoundPlayedSecondsAtFinish,
  resolveRoundTimerBudgetSeconds,
} from '../game/round-duration.js';
import { normalizeRoomCode } from './room-code.js';
import { sessionRef } from './session-ref.js';
import type { GameSession, GameSessionPlayer } from './types.js';
import { displayPlayerName } from '../online/public-lobby/display-player-name.js';

export type VoteChoice = 'yes' | 'no';

async function runSessionVoteTransaction(
  gameId: string,
  mutate: (session: GameSession) => GameSession | undefined,
  options?: { requirePlaying?: boolean },
): Promise<boolean> {
  const roomId = normalizeRoomCode(gameId);
  const pre = await get(sessionRef(roomId));
  if (!pre.exists()) {
    return false;
  }
  const preSession = pre.val() as GameSession;
  if (options?.requirePlaying && preSession.status !== 'playing') {
    return false;
  }
  try {
    const result = await runRtdbTransaction(sessionRef(roomId), (current) => {
      if (current == null) {
        return undefined;
      }
      const session = current as GameSession;
      if (options?.requirePlaying && session.status !== 'playing') {
        return undefined;
      }
      return mutate(session);
    });
    return result.committed;
  } catch (error) {
    if (isFirebaseIgnorableRtdbError(error)) {
      return false;
    }
    throw error;
  }
}

function initProposerVote(proposerId: string): Record<string, VoteChoice> {
  return { [proposerId]: 'yes' };
}

function finishPlayingSession(session: GameSession): GameSession {
  const finishedAt = getServerNow();
  session.roundPlayedSeconds = computeRoundPlayedSecondsAtFinish(session, finishedAt);
  session.status = 'finished';
  session.timerEndsAt = null;
  session.finishedAt = finishedAt;
  session.purgeAfterAt = computePurgeAfterAt(finishedAt);
  session.earlyFinishVote = null;
  session.pauseVote = null;
  session.addTimeVote = null;
  session.resumeVote = null;
  session.pauseState = null;
  return session;
}

function finishIfTimerExpired(session: GameSession): GameSession {
  const endsAt = session.timerEndsAt;
  if (endsAt !== null && getServerNow() >= endsAt) {
    return finishPlayingSession(session);
  }
  return session;
}

function applyAddTime(session: GameSession, addMinutes: number): GameSession {
  session.timerEndsAt = computeExtendedTimerEndsAt(session.timerEndsAt, addMinutes, getServerNow());
  session.roundTimerBudgetSeconds = resolveRoundTimerBudgetSeconds(session) + addMinutes * 60;
  session.addTimeVote = null;
  return session;
}

function activatePauseState(session: GameSession): GameSession {
  const endsAt = session.timerEndsAt ?? getServerNow();
  const remaining = Math.max(0, endsAt - getServerNow());
  session.pauseState = {
    active: true,
    frozenRemainingMs: remaining,
    frozenAt: getServerNow(),
  };
  session.timerEndsAt = null;
  session.pauseVote = null;
  session.resumeVote = null;
  return session;
}

function resumePlayingSession(session: GameSession): GameSession {
  const pause = session.pauseState;
  if (!pause?.active) {
    return session;
  }
  session.timerEndsAt = getServerNow() + pause.frozenRemainingMs;
  session.pauseState = null;
  session.resumeVote = null;
  return session;
}

/**
 * Propose ending the round early; proposer auto-votes yes.
 * When no online opponents remain, finishes immediately.
 */
export async function proposeEarlyFinish(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const required = earlyFinishRequiredVoterIds(session, uid);
      if (required.length === 0) {
        return finishPlayingSession(session);
      }

      session.earlyFinishVote = {
        proposedBy: uid,
        proposedAt: getServerNow(),
        votes: initProposerVote(uid),
      };
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Vote on early finish; finishes when all online opponents agree or timeout passes.
 */
export async function voteEarlyFinish(
  gameId: string,
  uid: string,
  choice: VoteChoice,
): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.earlyFinishVote;
      if (!vote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (!required.includes(uid)) {
        return undefined;
      }

      vote.votes = { ...vote.votes, [uid]: choice };
      session.earlyFinishVote = vote;

      if (anyRequiredVotedNo(vote, required)) {
        session.earlyFinishVote = null;
      } else if (shouldFinishFromEarlyVote(session, vote, getServerNow())) {
        finishPlayingSession(session);
      }
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Resolve an active early-finish vote after the 30s deadline (any client may commit).
 */
export async function resolveEarlyFinishVoteIfExpired(gameId: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.earlyFinishVote;
      if (!vote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (anyRequiredVotedNo(vote, required)) {
        session.earlyFinishVote = null;
        return session;
      }

      if (allRequiredVotedYes(vote, required)) {
        return finishPlayingSession(session);
      }

      if (earlyFinishVoteExpired(vote, getServerNow())) {
        return finishPlayingSession(session);
      }

      return undefined;
    },
    { requirePlaying: true },
  );
}

/**
 * Cancel an active early-finish proposal (proposer only).
 */
export async function cancelEarlyFinishVote(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.earlyFinishVote;
      if (!vote || vote.proposedBy !== uid) {
        return undefined;
      }
      session.earlyFinishVote = null;
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Propose adding minutes to the round timer.
 * Applies immediately when no online opponents remain.
 * @returns true when a vote was written or time was applied.
 */
export async function proposeAddTime(
  gameId: string,
  uid: string,
  addMinutes: number,
): Promise<boolean> {
  return runSessionVoteTransaction(
    gameId,
    (session) => {
      if (!session.players[uid] || session.pauseState?.active) {
        return undefined;
      }
      if (session.addTimeVote || session.earlyFinishVote || session.pauseVote) {
        return undefined;
      }
      if (session.timerEndsAt === null) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, uid);
      if (required.length === 0) {
        return applyAddTime(session, addMinutes);
      }

      session.addTimeVote = {
        proposedBy: uid,
        proposedAt: getServerNow(),
        votes: initProposerVote(uid),
        addMinutes,
      };
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Vote on adding time; extends timer when all online opponents agree.
 */
export async function voteAddTime(gameId: string, uid: string, choice: VoteChoice): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.addTimeVote;
      if (!vote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (!required.includes(uid)) {
        return undefined;
      }

      vote.votes = { ...vote.votes, [uid]: choice };
      session.addTimeVote = vote;

      if (anyRequiredVotedNo(vote, required)) {
        session.addTimeVote = null;
        return finishIfTimerExpired(session);
      }
      if (shouldApplyAddTimeFromVote(session, vote)) {
        return applyAddTime(session, vote.addMinutes);
      }
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Cancel an active add-time proposal (proposer only).
 */
export async function cancelAddTimeVote(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.addTimeVote;
      if (!vote || vote.proposedBy !== uid) {
        return undefined;
      }
      session.addTimeVote = null;
      return finishIfTimerExpired(session);
    },
    { requirePlaying: true },
  );
}

/**
 * Resolve an active add-time vote after the 30s deadline (any client may commit).
 */
export async function resolveAddTimeVoteIfExpired(gameId: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.addTimeVote;
      if (!vote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (anyRequiredVotedNo(vote, required)) {
        session.addTimeVote = null;
        return finishIfTimerExpired(session);
      }

      if (shouldApplyAddTimeFromVote(session, vote)) {
        return applyAddTime(session, vote.addMinutes);
      }

      if (shouldClearAddTimeVote(session, vote, getServerNow())) {
        session.addTimeVote = null;
        return finishIfTimerExpired(session);
      }

      return undefined;
    },
    { requirePlaying: true },
  );
}

/**
 * Propose pausing the round. Pauses immediately when no online opponents remain.
 */
export async function proposePause(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      if (session.pauseState?.active) {
        return undefined;
      }
      if (session.addTimeVote || session.earlyFinishVote || session.pauseVote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, uid);
      if (required.length === 0) {
        return activatePauseState(session);
      }

      session.pauseVote = {
        proposedBy: uid,
        proposedAt: getServerNow(),
        votes: initProposerVote(uid),
      };
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Vote on pause; activates pause when all online opponents agree.
 */
export async function votePause(gameId: string, uid: string, choice: VoteChoice): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.pauseVote;
      if (!vote) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (!required.includes(uid)) {
        return undefined;
      }

      vote.votes = { ...vote.votes, [uid]: choice };
      session.pauseVote = vote;

      if (anyRequiredVotedNo(vote, required)) {
        session.pauseVote = null;
      } else if (shouldActivatePauseFromVote(session, vote)) {
        return activatePauseState(session);
      }
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Cancel an active pause proposal (proposer only).
 */
export async function cancelPauseVote(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.pauseVote;
      if (!vote || vote.proposedBy !== uid) {
        return undefined;
      }
      session.pauseVote = null;
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Propose leaving pause. Resumes immediately when no online opponents remain.
 */
export async function proposeResume(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      if (!session.pauseState?.active || session.resumeVote) {
        return undefined;
      }

      const required = resumeVoteRequiredIds(session, uid);
      if (required.length === 0) {
        return resumePlayingSession(session);
      }

      session.resumeVote = {
        proposedBy: uid,
        proposedAt: getServerNow(),
        votes: initProposerVote(uid),
      };
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Vote on leaving pause; resumes when all online opponents agree or after 30s.
 */
export async function voteResume(gameId: string, uid: string, choice: VoteChoice): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.resumeVote;
      if (!vote || !session.pauseState?.active) {
        return undefined;
      }

      const required = resumeVoteRequiredIds(session, vote.proposedBy);
      if (!required.includes(uid)) {
        return undefined;
      }

      vote.votes = { ...vote.votes, [uid]: choice };
      session.resumeVote = vote;

      if (anyRequiredVotedNo(vote, required)) {
        session.resumeVote = null;
      } else if (shouldResumeFromVote(session, vote, getServerNow())) {
        return resumePlayingSession(session);
      }
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Cancel an active resume proposal (proposer only).
 */
export async function cancelResumeVote(gameId: string, uid: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.resumeVote;
      if (!vote || vote.proposedBy !== uid) {
        return undefined;
      }
      session.resumeVote = null;
      return session;
    },
    { requirePlaying: true },
  );
}

/**
 * Resolve an active resume vote after the 30s deadline (any client may commit).
 */
export async function resolveResumeVoteIfExpired(gameId: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.resumeVote;
      if (!vote || !session.pauseState?.active) {
        return undefined;
      }

      const required = resumeVoteRequiredIds(session, vote.proposedBy);
      if (anyRequiredVotedNo(vote, required)) {
        session.resumeVote = null;
        return session;
      }

      if (shouldResumeFromVote(session, vote, getServerNow())) {
        return resumePlayingSession(session);
      }

      return undefined;
    },
    { requirePlaying: true },
  );
}

/**
 * Activate pause when all remaining online required voters have agreed
 * (including when the required set becomes empty after someone goes offline).
 */
export async function resolvePauseVoteIfReady(gameId: string): Promise<void> {
  await runSessionVoteTransaction(
    gameId,
    (session) => {
      const vote = session.pauseVote;
      if (!vote || session.pauseState?.active) {
        return undefined;
      }

      const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
      if (anyRequiredVotedNo(vote, required)) {
        session.pauseVote = null;
        return session;
      }

      if (shouldActivatePauseFromVote(session, vote)) {
        return activatePauseState(session);
      }

      return undefined;
    },
    { requirePlaying: true },
  );
}

/**
 * After presence changes (background offline / voluntary leave), re-evaluate open votes
 * so remaining players are not stuck waiting on offline required voters.
 */
export async function reconcileOpenSessionVotes(gameId: string): Promise<void> {
  await resolvePauseVoteIfReady(gameId);
  await resolveEarlyFinishVoteIfExpired(gameId);
  await resolveAddTimeVoteIfExpired(gameId);
  await resolveResumeVoteIfExpired(gameId);
}

/**
 * Proposer display name for vote banners.
 */
export function voteProposerName(
  session: GameSession,
  proposedBy: string,
  viewerUid?: string,
): string {
  const player: GameSessionPlayer | undefined = session.players[proposedBy];
  if (!player) {
    return proposedBy;
  }
  if (viewerUid) {
    return displayPlayerName(player, viewerUid, proposedBy, session);
  }
  return player.name;
}
