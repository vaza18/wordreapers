import { SessionVoteModal } from '@/components/SessionVoteModal';
import type { AddTimeVote, GameSession } from '@/lib/firebase/types';

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

export function AddTimeVoteModal(props: AddTimeVoteModalProps) {
  return <SessionVoteModal voteType="addTime" {...props} />;
}
