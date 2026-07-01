import type { GameSession, SessionVote } from '../firebase/types.js';
import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  earlyFinishRequiredVoterIds,
  earlyFinishVoteExpired,
} from './early-finish-vote.js';
import { viewerNeedsSessionVote } from './viewer-needs-session-vote.js';

export { EARLY_FINISH_VOTE_TIMEOUT_MS as RESUME_VOTE_TIMEOUT_MS } from './early-finish-vote.js';

export function resumeVoteRequiredIds(session: GameSession, proposerId: string): string[] {
  return earlyFinishRequiredVoterIds(session, proposerId);
}

export function viewerNeedsResumeVote(
  session: GameSession,
  vote: SessionVote,
  viewerId: string,
): boolean {
  return viewerNeedsSessionVote(session, vote, viewerId, resumeVoteRequiredIds);
}

export function shouldResumeFromVote(
  session: GameSession,
  vote: SessionVote,
  now: number,
): boolean {
  const required = resumeVoteRequiredIds(session, vote.proposedBy);
  if (anyRequiredVotedNo(vote, required)) {
    return false;
  }
  if (allRequiredVotedYes(vote, required)) {
    return true;
  }
  return earlyFinishVoteExpired(vote, now);
}
