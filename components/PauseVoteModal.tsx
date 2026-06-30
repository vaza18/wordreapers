import { useTranslation } from 'react-i18next';

import { VoteParticipantModal } from '@/components/VoteParticipantCard';
import type { GameSession, SessionVote } from '@/lib/firebase/types';
import { buildEarlyFinishParticipantRows } from '@/lib/online/early-finish-vote';
import { viewerNeedsPauseVote } from '@/lib/online/pause-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface PauseVoteModalProps {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  vote: SessionVote;
  myUid: string;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
}

export function PauseVoteModal({
  visible,
  layout = 'modal',
  session,
  vote,
  myUid,
  onYes,
  onNo,
  onCancelProposal,
}: PauseVoteModalProps) {
  const { t } = useTranslation();
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsPauseVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);
  const headline = isProposer
    ? t('game.votePauseSent')
    : t('game.votePause', { name: voteProposerName(session, vote.proposedBy, myUid) });

  return (
    <VoteParticipantModal
      visible={visible}
      layout={layout}
      headline={headline}
      participants={participants}
      myUid={myUid}
      needsVote={needsVote}
      isProposer={isProposer}
      onYes={onYes}
      onNo={onNo}
      cancelLabel={t('game.votePauseCancel')}
      onCancelProposal={onCancelProposal}
    />
  );
}
