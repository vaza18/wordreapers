import { useEffect } from 'react';

import {
  resolveAddTimeVoteIfExpired,
  resolveEarlyFinishVoteIfExpired,
  resolveResumeVoteIfExpired,
} from '@/lib/firebase/session-votes-service';

type VoteExpiryFlags = {
  gameId: string;
  enabled: boolean;
  earlyFinishVote: unknown;
  addTimeVote: unknown;
  resumeVote: unknown;
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
  pauseActive,
  playing,
}: VoteExpiryFlags): void {
  const hasEarlyFinish = Boolean(earlyFinishVote) && playing;
  const hasAddTime = Boolean(addTimeVote) && playing;
  const hasResume = Boolean(resumeVote) && pauseActive && playing;
  const active = enabled && (hasEarlyFinish || hasAddTime || hasResume);

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
    };

    resolve();
    const timer = setInterval(resolve, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [active, gameId, hasAddTime, hasEarlyFinish, hasResume]);
}
