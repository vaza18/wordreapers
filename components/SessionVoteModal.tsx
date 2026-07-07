import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/PrimaryButton';
import { VoteParticipantModal } from '@/components/VoteParticipantCard';
import { useServerNowWhen } from '@/hooks/useServerNow';
import type { AddTimeVote, GameSession, SessionVote } from '@/lib/firebase/types';
import { viewerNeedsAddTimeVote } from '@/lib/online/voting/add-time-vote';
import {
  buildEarlyFinishParticipantRows,
  EARLY_FINISH_VOTE_TIMEOUT_MS,
  viewerNeedsEarlyFinishVote,
} from '@/lib/online/voting/early-finish-vote';
import { viewerNeedsPauseVote } from '@/lib/online/voting/pause-vote';
import { voteProposerName } from '@/lib/firebase/session-votes-service';
import { formatTimerMs } from '@/lib/game/timer-label';

type SessionVoteModalBaseProps = {
  visible: boolean;
  layout?: 'modal' | 'banner';
  session: GameSession;
  myUid: string;
  serverNow?: number;
  onYes: () => void;
  onNo: () => void;
  onCancelProposal?: () => void;
};

export type SessionVoteModalProps = SessionVoteModalBaseProps &
  (
    | { voteType: 'pause'; vote: SessionVote }
    | { voteType: 'addTime'; vote: AddTimeVote }
    | { voteType: 'earlyFinish'; vote: SessionVote; onLeaveNow?: () => void }
  );

/** Config-driven session vote dialog (pause, add-time, early-finish). */
export function SessionVoteModal(props: SessionVoteModalProps) {
  const { t } = useTranslation();
  const {
    visible,
    layout = 'modal',
    session,
    myUid,
    serverNow: serverNowProp,
    onYes,
    onNo,
    onCancelProposal,
  } = props;
  const tickNow = useServerNowWhen(visible && props.voteType !== 'pause', 250);
  const serverNow = serverNowProp ?? tickNow;
  const vote = props.vote;
  const isProposer = vote.proposedBy === myUid;
  const participants = buildEarlyFinishParticipantRows(session, vote, myUid);

  const needsVote = (() => {
    switch (props.voteType) {
      case 'pause':
        return viewerNeedsPauseVote(session, props.vote, myUid);
      case 'addTime':
        return viewerNeedsAddTimeVote(session, props.vote, myUid);
      case 'earlyFinish':
        return viewerNeedsEarlyFinishVote(session, props.vote, myUid);
    }
  })();

  const proposerName = voteProposerName(session, vote.proposedBy, myUid);

  const {
    headline,
    subheadline,
    cancelLabel,
    extraActions,
    voteLeftRequiresOffline,
    presenceLeftFirst,
  } = useMemo(() => {
    switch (props.voteType) {
      case 'pause':
        return {
          headline: isProposer
            ? t('game.votePauseSent')
            : t('game.votePause', { name: proposerName }),
          subheadline: null as string | null,
          cancelLabel: t('game.votePauseCancel'),
          extraActions: null,
          voteLeftRequiresOffline: undefined,
          presenceLeftFirst: undefined,
        };
      case 'addTime': {
        const addTimeVote = props.vote;
        const timerEndsAt = session.timerEndsAt;
        const remainingMs = timerEndsAt != null ? Math.max(0, timerEndsAt - serverNow) : 0;
        return {
          headline: isProposer
            ? t('game.voteAddTimeSent', { count: addTimeVote.addMinutes })
            : t('game.voteAddTime', { name: proposerName, count: addTimeVote.addMinutes }),
          subheadline:
            timerEndsAt != null
              ? t('game.voteAddTimeTimer', {
                  from: formatTimerMs(remainingMs),
                  to: formatTimerMs(remainingMs + addTimeVote.addMinutes * 60_000),
                })
              : null,
          cancelLabel: t('game.voteAddTimeCancel'),
          extraActions: null,
          voteLeftRequiresOffline: false as const,
          presenceLeftFirst: true as const,
        };
      }
      case 'earlyFinish': {
        const earlyFinishVote = props.vote;
        const proposedAt = earlyFinishVote.proposedAt ?? serverNow;
        const secondsLeft = Math.max(
          0,
          Math.ceil((proposedAt + EARLY_FINISH_VOTE_TIMEOUT_MS - serverNow) / 1000),
        );
        return {
          headline: isProposer
            ? t('game.voteEarlyFinishSent')
            : t('game.voteEarlyFinish', { name: proposerName }),
          subheadline:
            secondsLeft > 0 ? t('game.voteEarlyFinishTimer', { seconds: secondsLeft }) : null,
          cancelLabel: t('game.voteEarlyFinishCancel'),
          extraActions:
            isProposer && props.onLeaveNow ? (
              <PrimaryButton
                label={t('game.voteEarlyFinishLeaveNow')}
                variant="secondary"
                onPress={props.onLeaveNow}
              />
            ) : null,
          voteLeftRequiresOffline: undefined,
          presenceLeftFirst: undefined,
        };
      }
    }
  }, [isProposer, proposerName, props, serverNow, session.timerEndsAt, t]);

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
      cancelLabel={cancelLabel}
      onCancelProposal={onCancelProposal}
      extraActions={extraActions}
      voteLeftRequiresOffline={voteLeftRequiresOffline}
      presenceLeftFirst={presenceLeftFirst}
    />
  );
}
