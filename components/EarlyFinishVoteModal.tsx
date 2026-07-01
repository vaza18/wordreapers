import { SessionVoteModal } from '@/components/SessionVoteModal';
import type { GameSession, SessionVote } from '@/lib/firebase/types';

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

/** Early-finish vote dialog with roster, online markers, and per-player vote status. */
export function EarlyFinishVoteModal({ onLeaveNow, ...props }: EarlyFinishVoteModalProps) {
  return <SessionVoteModal voteType="earlyFinish" onLeaveNow={onLeaveNow} {...props} />;
}
