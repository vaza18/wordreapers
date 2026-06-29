import type { GameSession, SessionVote } from '../firebase/types.js';
import { displayPlayerName } from '../online/public-lobby/display-player-name.js';
import { isActiveLivePlayer } from './live-round-membership.js';
import { playerGenderForDisplay } from '../online/public-lobby/session-identity.js';
import { playerGenderFromSession } from '../game/vote-status-label.js';

export const EARLY_FINISH_VOTE_TIMEOUT_MS = 30_000;

export type EarlyFinishVoteStatus = 'yes' | 'no' | 'pending' | 'not_required';

export interface EarlyFinishParticipantRow {
  playerId: string;
  name: string;
  gender: 'm' | 'f' | null;
  online: boolean;
  hasLeft: boolean;
  voteStatus: EarlyFinishVoteStatus;
}

/** Must vote: active in the current live `playing` round, not the proposer. */
export function isEarlyFinishVoteRequired(
  session: GameSession,
  playerId: string,
  proposerId: string,
): boolean {
  if (playerId === proposerId) {
    return false;
  }
  return isActiveLivePlayer(session, playerId);
}

/**
 * Online opponents still in the round who must accept or reject (proposer is excluded).
 */
export function earlyFinishRequiredVoterIds(session: GameSession, proposerId: string): string[] {
  return Object.keys(session.players).filter((id) =>
    isEarlyFinishVoteRequired(session, id, proposerId),
  );
}

export function earlyFinishVoteExpired(vote: SessionVote, now: number): boolean {
  const proposedAt = vote.proposedAt ?? 0;
  return proposedAt > 0 && now >= proposedAt + EARLY_FINISH_VOTE_TIMEOUT_MS;
}

export function anyRequiredVotedNo(vote: SessionVote, required: string[]): boolean {
  return required.some((id) => vote.votes[id] === 'no');
}

export function allRequiredVotedYes(vote: SessionVote, required: string[]): boolean {
  return required.length === 0 || required.every((id) => vote.votes[id] === 'yes');
}

/**
 * Whether the vote should end the round now (all online voters agreed).
 */
export function shouldFinishFromEarlyVote(
  session: GameSession,
  vote: SessionVote,
  now: number,
): boolean {
  const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
  if (anyRequiredVotedNo(vote, required)) {
    return false;
  }
  if (allRequiredVotedYes(vote, required)) {
    return true;
  }
  return earlyFinishVoteExpired(vote, now);
}

export function viewerNeedsEarlyFinishVote(
  session: GameSession,
  vote: SessionVote,
  viewerId: string,
): boolean {
  if (viewerId === vote.proposedBy) {
    return false;
  }
  const required = earlyFinishRequiredVoterIds(session, vote.proposedBy);
  return required.includes(viewerId) && vote.votes[viewerId] === undefined;
}

export function buildEarlyFinishParticipantRows(
  session: GameSession,
  vote: SessionVote,
  viewerUid?: string,
): EarlyFinishParticipantRow[] {
  const required = new Set(earlyFinishRequiredVoterIds(session, vote.proposedBy));
  const visibleIds = new Set([vote.proposedBy, ...required]);

  return [...visibleIds]
    .sort((a, b) => session.players[a].name.localeCompare(session.players[b].name, 'uk'))
    .map((playerId) => {
      const player = session.players[playerId];
      const online = player.online === true;
      const hasLeft = player.hasLeft === true;
      const voluntarilyLeft = hasLeft && !online;
      let voteStatus: EarlyFinishVoteStatus = 'not_required';

      if (playerId === vote.proposedBy) {
        voteStatus = 'yes';
      } else if (voluntarilyLeft) {
        voteStatus = 'not_required';
      } else if (required.has(playerId)) {
        const choice = vote.votes[playerId];
        voteStatus = choice ?? 'pending';
      }

      return {
        playerId,
        name: viewerUid ? displayPlayerName(player, viewerUid, playerId, session) : player.name,
        gender: viewerUid
          ? playerGenderForDisplay(session, viewerUid, playerId)
          : playerGenderFromSession(player.gender),
        online,
        hasLeft,
        voteStatus,
      };
    });
}
