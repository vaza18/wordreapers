import type { AddTimeVote, GameSession } from '../firebase/types.js';
import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  earlyFinishRequiredVoterIds,
  earlyFinishVoteExpired,
} from './early-finish-vote.js';

export const ADD_TIME_MINUTE_OPTIONS = [1, 3, 5, 10, 20] as const;

export function addTimeVoteRequiredIds(session: GameSession, proposerId: string): string[] {
  return earlyFinishRequiredVoterIds(session, proposerId);
}

export function viewerNeedsAddTimeVote(
  session: GameSession,
  vote: AddTimeVote,
  viewerId: string,
): boolean {
  if (viewerId === vote.proposedBy) {
    return false;
  }
  const required = addTimeVoteRequiredIds(session, vote.proposedBy);
  return required.includes(viewerId) && vote.votes[viewerId] === undefined;
}

export function shouldApplyAddTimeFromVote(session: GameSession, vote: AddTimeVote): boolean {
  const required = addTimeVoteRequiredIds(session, vote.proposedBy);
  return allRequiredVotedYes(vote, required);
}

export function shouldClearAddTimeVote(
  session: GameSession,
  vote: AddTimeVote,
  now: number,
): boolean {
  const required = addTimeVoteRequiredIds(session, vote.proposedBy);
  if (anyRequiredVotedNo(vote, required)) {
    return true;
  }
  return earlyFinishVoteExpired(vote, now);
}
