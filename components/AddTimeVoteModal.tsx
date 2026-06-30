import { useTranslation } from 'react-i18next';

import { VoteParticipantModal } from '@/components/VoteParticipantCard';
import { useServerNowWhen } from '@/hooks/useServerNow';
import type { AddTimeVote, GameSession } from '@/lib/firebase/types';
import { formatTimerMs } from '@/lib/game/timer-label';
import { buildEarlyFinishParticipantRows } from '@/lib/online/early-finish-vote';
import { viewerNeedsAddTimeVote } from '@/lib/online/add-time-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';

interface AddTimeVoteModalProps {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  vote: AddTimeVote;
  myUid: string;
  serverNow?: number;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
}

export function AddTimeVoteModal({
  visible,
  layout = 'modal',
  session,
  vote,
  myUid,
  serverNow: serverNowProp,
  onYes,
  onNo,
  onCancelProposal,
}: AddTimeVoteModalProps) {
  const { t } = useTranslation();
  const tickNow = useServerNowWhen(visible, 250);
  const serverNow = serverNowProp ?? tickNow;
  const isProposer = vote.proposedBy === myUid;
  const needsVote = viewerNeedsAddTimeVote(session, vote, myUid);
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);

  const headline = isProposer
    ? t('game.voteAddTimeSent', { count: vote.addMinutes })
    : t('game.voteAddTime', {
        name: voteProposerName(session, vote.proposedBy, myUid),
        count: vote.addMinutes,
      });

  const timerEndsAt = session.timerEndsAt;
  const remainingMs = timerEndsAt != null ? Math.max(0, timerEndsAt - serverNow) : 0;
  const subheadline =
    timerEndsAt != null
      ? t('game.voteAddTimeTimer', {
          from: formatTimerMs(remainingMs),
          to: formatTimerMs(remainingMs + vote.addMinutes * 60_000),
        })
      : null;

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
      cancelLabel={t('game.voteAddTimeCancel')}
      onCancelProposal={onCancelProposal}
      voteLeftRequiresOffline={false}
      presenceLeftFirst
    />
  );
}
