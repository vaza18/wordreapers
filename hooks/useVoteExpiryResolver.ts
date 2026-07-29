import { useEffect } from 'react';

import { getServerNow } from '@/lib/firebase/server-clock';
import {
  resolveAddTimeVoteIfExpired,
  resolveEarlyFinishVoteIfExpired,
  resolvePauseVoteIfReady,
  resolveResumeVoteIfExpired,
} from '@/lib/firebase/session-votes-service';
import type { GameSessionPlayer, SessionVote } from '@/lib/firebase/types';
import { EARLY_FINISH_VOTE_TIMEOUT_MS } from '@/lib/online/voting/early-finish-vote';
import {
  earliestVoteExpiresAt,
  msUntil,
  nextExpiryNetworkWakeAt,
  onlineExpiryResolverCandidateUids,
  shouldAttemptExpiryNetworkResolve,
} from '@/lib/online/voting/expiry-resolver-role';

type VoteExpiryFlags = {
  gameId: string;
  myUid: string;
  enabled: boolean;
  earlyFinishVote: SessionVote | null | undefined;
  addTimeVote: SessionVote | null | undefined;
  resumeVote: SessionVote | null | undefined;
  pauseVote: SessionVote | null | undefined;
  pauseActive: boolean;
  playing: boolean;
  players: Record<string, GameSessionPlayer> | null | undefined;
  liveRoundPlayerUids: readonly string[] | null | undefined;
};

/**
 * Schedule wall-clock vote expiry (primary + failover) instead of N×1s full-session polls.
 * Unanimous / presence reconcile paths stay event-driven elsewhere.
 */
export function useVoteExpiryResolver({
  gameId,
  myUid,
  enabled,
  earlyFinishVote,
  addTimeVote,
  resumeVote,
  pauseVote,
  pauseActive,
  playing,
  players,
  liveRoundPlayerUids,
}: VoteExpiryFlags): void {
  const hasEarlyFinish = Boolean(earlyFinishVote) && playing;
  const hasAddTime = Boolean(addTimeVote) && playing;
  const hasResume = Boolean(resumeVote) && pauseActive && playing;
  const hasPause = Boolean(pauseVote) && playing && !pauseActive;
  const active = enabled && (hasEarlyFinish || hasAddTime || hasResume || hasPause);

  const expiresAt = earliestVoteExpiresAt(
    [
      hasEarlyFinish ? earlyFinishVote : null,
      hasAddTime ? addTimeVote : null,
      hasResume ? resumeVote : null,
      hasPause ? pauseVote : null,
    ],
    EARLY_FINISH_VOTE_TIMEOUT_MS,
  );

  useEffect(() => {
    if (!active || !gameId || !myUid || expiresAt == null) {
      return undefined;
    }

    const candidateUids = onlineExpiryResolverCandidateUids(players ?? {}, liveRoundPlayerUids);

    const resolveIfDue = () => {
      const now = getServerNow();
      if (
        !shouldAttemptExpiryNetworkResolve({
          myUid,
          candidateUids,
          now,
          expiresAt,
        })
      ) {
        return;
      }
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

    const wakeAt = nextExpiryNetworkWakeAt({
      myUid,
      candidateUids,
      expiresAt,
    });
    const delay = msUntil(wakeAt, getServerNow());
    const timer = setTimeout(resolveIfDue, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [
    active,
    expiresAt,
    gameId,
    hasAddTime,
    hasEarlyFinish,
    hasPause,
    hasResume,
    liveRoundPlayerUids,
    myUid,
    players,
  ]);
}
