import type { GameSession, SessionVote } from '../firebase/types.js';
import { earlyFinishRequiredVoterIds } from './early-finish-vote.js';
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

export function shouldActivatePauseFromVote(session: GameSession, vote: SessionVote): boolean {
  const required = pauseVoteRequiredIds(session, vote.proposedBy);
  return required.every((id) => vote.votes[id] === 'yes');
}
