import { SessionVoteModal } from '@/components/SessionVoteModal';
import type { GameSession, SessionVote } from '@/lib/firebase/types';

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

export function PauseVoteModal(props: PauseVoteModalProps) {
  return <SessionVoteModal voteType="pause" {...props} />;
}
