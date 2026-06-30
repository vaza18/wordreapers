import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/PrimaryButton';
import { VoteParticipantModal } from '@/components/VoteParticipantCard';
import { useServerNowWhen } from '@/hooks/useServerNow';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import {
  buildEarlyFinishParticipantRows,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  viewerNeedsEarlyFinishVote,
} from '@/lib/online/early-finish-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface EarlyFinishVoteModalProps {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  vote: SessionVote;
  myUid: string;
  serverNow?: number;
  onYes: () => void;
  onNo: () => void;
  onLeaveNow?: () => void;
  onCancelProposal?: () => void;
}

/**
 * Early-finish vote dialog with roster, online markers, and per-player vote status.
 */
export function EarlyFinishVoteModal({
  visible,
  layout = 'modal',
  session,
  vote,
  myUid,
  serverNow: serverNowProp,
  onYes,
  onNo,
  onLeaveNow,
  onCancelProposal,
}: EarlyFinishVoteModalProps) {
  const { t } = useTranslation();
  const tickNow = useServerNowWhen(visible, 250);
  const serverNow = serverNowProp ?? tickNow;
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsEarlyFinishVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);

  const secondsLeft = useMemo(() => {
    const proposedAt = vote.proposedAt ?? serverNow;
    const remaining = Math.ceil((proposedAt + EARLY_FINISH_VOTE_TIMEOUT_MS - serverNow) / 1000);
    return Math.max(0, remaining);
  }, [serverNow, vote.proposedAt]);

  const headline = isProposer
    ? t('game.voteEarlyFinishSent')
    : t('game.voteEarlyFinish', { name: voteProposerName(session, vote.proposedBy, myUid) });

  const subheadline =
    secondsLeft > 0 ? t('game.voteEarlyFinishTimer', { seconds: secondsLeft }) : null;

  return (
    <VoteParticipantModal
      visible={visible}
      layout={layout}
      headline={headline}
      subheadline={subheadline}
      participants={participants}
      myUid={myUid}
      needsVote={needsVote}
      isProposer={isProposer}
      onYes={onYes}
      onNo={onNo}
      cancelLabel={t('game.voteEarlyFinishCancel')}
      onCancelProposal={onCancelProposal}
      extraActions={
        isProposer && onLeaveNow ? (
          <PrimaryButton
            label={t('game.voteEarlyFinishLeaveNow')}
            variant="secondary"
            onPress={onLeaveNow}
          />
        ) : null
      }
    />
  );
}
