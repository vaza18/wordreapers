import { useEffect } from 'react';

import {
  resolveAddTimeVoteIfExpired,
  resolveEarlyFinishVoteIfExpired,
  resolvePauseVoteIfReady,
  resolveResumeVoteIfExpired,
} from '@/lib/firebase/session-votes-service';

type VoteExpiryFlags = {
  gameId: string;
  enabled: boolean;
  earlyFinishVote: unknown;
  addTimeVote: unknown;
  resumeVote: unknown;
  pauseVote: unknown;
  pauseActive: boolean;
  playing: boolean;
};

/**
 * Single 1s interval for vote expiry resolution while any vote is active.
 */
export function useVoteExpiryResolver({
  gameId,
  enabled,
  earlyFinishVote,
  addTimeVote,
  resumeVote,
  pauseVote,
  pauseActive,
  playing,
}: VoteExpiryFlags): void {
  const hasEarlyFinish = Boolean(earlyFinishVote) && playing;
  const hasAddTime = Boolean(addTimeVote) && playing;
  const hasResume = Boolean(resumeVote) && pauseActive && playing;
  const hasPause = Boolean(pauseVote) && playing && !pauseActive;
  const active = enabled && (hasEarlyFinish || hasAddTime || hasResume || hasPause);

  useEffect(() => {
    if (!active || !gameId) {
      return undefined;
    }

    const resolve = () => {
      if (hasEarlyFinish) {
        void resolveEarlyFinishVoteIfExpired(gameId);
      }
      if (hasAddTime) {
        void resolveAddTimeVoteIfExpired(gameId);
      }
      if (hasResume) {
        void resolveResumeVoteIfExpired(gameId);
      }
      if (hasPause) {
        void resolvePauseVoteIfReady(gameId);
      }
    };

    resolve();
    const timer = setInterval(resolve, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active, gameId, hasAddTime, hasEarlyFinish, hasPause, hasResume]);
}
