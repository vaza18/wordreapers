import type { GameSession, SessionVote } from '../firebase/types.js';
import { earlyFinishRequiredVoterIds } from './early-finish-vote.js';

export function pauseVoteRequiredIds(session: GameSession, proposerId: string): string[] {
  return earlyFinishRequiredVoterIds(session, proposerId);
}

export function viewerNeedsPauseVote(
  session: GameSession,
  vote: SessionVote,
  viewerId: string,
): boolean {
  if (viewerId === vote.proposedBy) {
    return false;
  }
  const required = pauseVoteRequiredIds(session, vote.proposedBy);
  return required.includes(viewerId) && vote.votes[viewerId] === undefined;
}

export function shouldActivatePauseFromVote(session: GameSession, vote: SessionVote): boolean {
  const required = pauseVoteRequiredIds(session, vote.proposedBy);
  return required.every((id) => vote.votes[id] === 'yes');
}
