import type { GameSession, SessionVote } from '../../firebase/types.js';
import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  earlyFinishRequiredVoterIds,
  earlyFinishVoteExpired,
} from './early-finish-vote.js';
import { viewerNeedsSessionVote } from './viewer-needs-session-vote.js';

export function pauseVoteRequiredIds(session: GameSession, proposerId: string): string[] {
  return earlyFinishRequiredVoterIds(session, proposerId);
}

export function viewerNeedsPauseVote(
  session: GameSession,
  vote: SessionVote,
  viewerId: string,
): boolean {
  return viewerNeedsSessionVote(session, vote, viewerId, pauseVoteRequiredIds);
}

/**
 * Activate pause when all required voters agree, or after 30s with no rejection
 * (same silence-as-yes rule as early-finish / resume).
 */
export function shouldActivatePauseFromVote(
  session: GameSession,
  vote: SessionVote,
  now: number = 0,
): boolean {
  const required = pauseVoteRequiredIds(session, vote.proposedBy);
  if (anyRequiredVotedNo(vote, required)) {
    return false;
  }
  if (allRequiredVotedYes(vote, required)) {
    return true;
  }
  return now > 0 && earlyFinishVoteExpired(vote, now);
}
