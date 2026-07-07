import { memo, useCallback } from 'react';

import { AddTimeVoteModal } from '@/components/AddTimeVoteModal';
import { EarlyFinishVoteModal } from '@/components/EarlyFinishVoteModal';
import { PauseVoteModal } from '@/components/PauseVoteModal';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import type { AddTimeVote } from '@/lib/firebase/types';
import { viewerNeedsAddTimeVote } from '@/lib/online/voting/add-time-vote';
import { viewerNeedsEarlyFinishVote } from '@/lib/online/voting/early-finish-vote';
import { viewerNeedsPauseVote } from '@/lib/online/voting/pause-vote';
import { shouldShowInvitePlayVoteBanner } from '@/lib/online/voting/play-vote-banner';

export type PlayVoteLayerProps = {
  layout: 'modal' | 'banner';
  isPaused: boolean;
  session: GameSession;
  myUid: string;
  earlyVote: SessionVote | null | undefined;
  pauseVote: SessionVote | null | undefined;
  addTimeVote: AddTimeVote | null | undefined;
  onVoteEarlyFinish: (choice: 'yes' | 'no') => void;
  onCancelEarlyFinishProposal?: () => void;
  onLeaveNowFromEarlyFinish?: () => void;
  onVotePause: (choice: 'yes' | 'no') => void;
  onCancelPauseProposal?: () => void;
  onVoteAddTime: (choice: 'yes' | 'no') => void;
  onCancelAddTimeProposal?: () => void;
};

export const PlayVoteLayer = memo(function PlayVoteLayer({
  layout,
  isPaused,
  session,
  myUid,
  earlyVote,
  pauseVote,
  addTimeVote,
  onVoteEarlyFinish,
  onCancelEarlyFinishProposal,
  onLeaveNowFromEarlyFinish,
  onVotePause,
  onCancelPauseProposal,
  onVoteAddTime,
  onCancelAddTimeProposal,
}: PlayVoteLayerProps) {
  const voteEarlyYes = useCallback(() => onVoteEarlyFinish('yes'), [onVoteEarlyFinish]);
  const voteEarlyNo = useCallback(() => onVoteEarlyFinish('no'), [onVoteEarlyFinish]);
  const votePauseYes = useCallback(() => onVotePause('yes'), [onVotePause]);
  const votePauseNo = useCallback(() => onVotePause('no'), [onVotePause]);
  const voteAddTimeYes = useCallback(() => onVoteAddTime('yes'), [onVoteAddTime]);
  const voteAddTimeNo = useCallback(() => onVoteAddTime('no'), [onVoteAddTime]);

  if (isPaused) {
    return null;
  }

  if (earlyVote) {
    const needsVote = viewerNeedsEarlyFinishVote(session, earlyVote, myUid);
    if (
      layout === 'banner' &&
      !shouldShowInvitePlayVoteBanner(earlyVote.proposedBy, myUid, needsVote)
    ) {
      return null;
    }
    return (
      <EarlyFinishVoteModal
        visible
        layout={layout}
        session={session}
        vote={earlyVote}
        myUid={myUid}
        onYes={voteEarlyYes}
        onNo={voteEarlyNo}
        onCancelProposal={earlyVote.proposedBy === myUid ? onCancelEarlyFinishProposal : undefined}
        onLeaveNow={earlyVote.proposedBy === myUid ? onLeaveNowFromEarlyFinish : undefined}
      />
    );
  }

  if (pauseVote && !addTimeVote) {
    const needsVote = viewerNeedsPauseVote(session, pauseVote, myUid);
    if (
      layout === 'banner' &&
      !shouldShowInvitePlayVoteBanner(pauseVote.proposedBy, myUid, needsVote)
    ) {
      return null;
    }
    return (
      <PauseVoteModal
        visible
        layout={layout}
        session={session}
        vote={pauseVote}
        myUid={myUid}
        onYes={votePauseYes}
        onNo={votePauseNo}
        onCancelProposal={pauseVote.proposedBy === myUid ? onCancelPauseProposal : undefined}
      />
    );
  }

  if (addTimeVote && session.status === 'playing' && !pauseVote) {
    const needsVote = viewerNeedsAddTimeVote(session, addTimeVote, myUid);
    if (
      layout === 'banner' &&
      !shouldShowInvitePlayVoteBanner(addTimeVote.proposedBy, myUid, needsVote)
    ) {
      return null;
    }
    return (
      <AddTimeVoteModal
        visible
        layout={layout}
        session={session}
        vote={addTimeVote}
        myUid={myUid}
        onYes={voteAddTimeYes}
        onNo={voteAddTimeNo}
        onCancelProposal={addTimeVote.proposedBy === myUid ? onCancelAddTimeProposal : undefined}
      />
    );
  }

  return null;
});
