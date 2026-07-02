import { useCallback, useEffect, useMemo, type RefObject } from 'react';
import type { TFunction } from 'i18next';

import { useAutoPauseOnAppBackground } from '@/hooks/useAutoPauseOnAppBackground';
import { PLAY_WORD_FEEDBACK_DISMISS_MS } from '@/hooks/usePlayWordFeedback';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { finishGameSession } from '@/lib/firebase/game-session-service';
import {
  cancelAddTimeVote,
  cancelEarlyFinishVote,
  cancelPauseVote,
  cancelResumeVote,
  proposeEarlyFinish,
  proposePause,
  voteAddTime,
  voteEarlyFinish,
  votePause,
} from '@/lib/firebase/session-votes-service';
import { hasOnlineOpponent, onlineActiveOpponentNames } from '@/lib/online/session-presence';
import type { SessionWordMaps } from '@/lib/firebase/types';

type UsePlayVoteActionsParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  isPaused: boolean;
  debounceRef: RefObject<ReturnType<typeof setTimeout> | null>;
  runIntentionalLeave: () => void;
  setFeedback: (message: string | null) => void;
  setShowEndEarlyConfirm: (open: boolean | ((prev: boolean) => boolean)) => void;
  setShowAddTimeModal: (value: boolean) => void;
  setShowStandings: (value: boolean) => void;
  t: TFunction;
};

/**
 * Vote propose/cancel handlers and solo auto-pause for online play.
 */
export function usePlayVoteActions({
  gameId,
  myUid,
  session,
  isPaused,
  debounceRef,
  runIntentionalLeave,
  setFeedback,
  setShowEndEarlyConfirm,
  setShowAddTimeModal,
  setShowStandings,
  t,
}: UsePlayVoteActionsParams) {
  const cancelEarlyFinishProposal = useCallback(() => {
    if (!myUid) {
      return;
    }
    void cancelEarlyFinishVote(gameId, myUid);
  }, [gameId, myUid]);

  const cancelPauseProposal = useCallback(() => {
    if (!myUid) {
      return;
    }
    void cancelPauseVote(gameId, myUid);
  }, [gameId, myUid]);

  const cancelAddTimeProposal = useCallback(() => {
    if (!myUid) {
      return;
    }
    void cancelAddTimeVote(gameId, myUid);
  }, [gameId, myUid]);

  const cancelResumeProposal = useCallback(() => {
    if (!myUid) {
      return;
    }
    void cancelResumeVote(gameId, myUid);
  }, [gameId, myUid]);

  const leaveNowFromEarlyFinish = useCallback(() => {
    if (!myUid || !session) {
      return;
    }
    void (async () => {
      try {
        await cancelEarlyFinishVote(gameId, myUid);
      } catch (error) {
        if (__DEV__) {
          console.warn('leaveNowFromEarlyFinish cancel vote', error);
        }
      }
      runIntentionalLeave();
    })();
  }, [gameId, myUid, runIntentionalLeave, session]);

  const onVoteEarlyFinish = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void voteEarlyFinish(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const onVotePause = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void votePause(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const onVoteAddTime = useCallback(
    (choice: 'yes' | 'no') => {
      if (!myUid) {
        return;
      }
      void voteAddTime(gameId, myUid, choice);
    },
    [gameId, myUid],
  );

  const hasOnlineOpponentInRound = useMemo(
    () => (session && myUid ? hasOnlineOpponent(session, myUid) : false),
    [myUid, session],
  );

  useAutoPauseOnAppBackground(
    session?.status === 'playing' && !isPaused && !hasOnlineOpponentInRound,
    () => {
      void proposePause(gameId, myUid);
    },
  );

  useEffect(() => {
    if (!hasOnlineOpponentInRound) {
      return;
    }
    setShowEndEarlyConfirm((open) => {
      if (open && session && myUid) {
        const names = onlineActiveOpponentNames(session, myUid).join(', ');
        setFeedback(t('game.endEarlyOpponentOnline', { names }));
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          setFeedback(null);
        }, PLAY_WORD_FEEDBACK_DISMISS_MS);
      }
      return false;
    });
  }, [
    debounceRef,
    hasOnlineOpponentInRound,
    myUid,
    session,
    setFeedback,
    setShowEndEarlyConfirm,
    t,
  ]);

  const handleEndEarlyConfirm = useCallback(
    (wordMaps: SessionWordMaps | null) => {
      setShowEndEarlyConfirm(false);
      if (session && myUid && hasOnlineOpponent(session, myUid)) {
        void proposeEarlyFinish(gameId, myUid);
        return;
      }
      void finishGameSession(gameId, wordMaps ?? undefined);
    },
    [gameId, myUid, session, setShowEndEarlyConfirm],
  );

  useEffect(() => {
    if (session?.status !== 'playing') {
      return;
    }
    const voteActive = Boolean(session.earlyFinishVote || session.pauseVote || session.addTimeVote);
    if (!voteActive) {
      return;
    }
    setShowAddTimeModal(false);
    setShowStandings(false);
  }, [
    session?.addTimeVote,
    session?.earlyFinishVote,
    session?.pauseVote,
    session?.status,
    setShowAddTimeModal,
    setShowStandings,
  ]);

  return {
    cancelEarlyFinishProposal,
    cancelPauseProposal,
    cancelAddTimeProposal,
    cancelResumeProposal,
    leaveNowFromEarlyFinish,
    onVoteEarlyFinish,
    onVotePause,
    onVoteAddTime,
    hasOnlineOpponentInRound,
    handleEndEarlyConfirm,
  };
}
