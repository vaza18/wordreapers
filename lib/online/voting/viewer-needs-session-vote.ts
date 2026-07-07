import type { GameSession, SessionVote } from '../../firebase/types.js';

/** Whether the viewer must cast a vote (not proposer, in required set, not yet voted). */
export function viewerNeedsSessionVote(
  session: GameSession,
  vote: SessionVote,
  viewerId: string,
  getRequiredIds: (session: GameSession, proposerId: string) => string[],
): boolean {
  if (viewerId === vote.proposedBy) {
    return false;
  }
  const required = getRequiredIds(session, vote.proposedBy);
  return required.includes(viewerId) && vote.votes[viewerId] === undefined;
}
