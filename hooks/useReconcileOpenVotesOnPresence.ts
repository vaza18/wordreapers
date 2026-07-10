import { useEffect, useRef } from 'react';

import { reconcileOpenSessionVotes } from '@/lib/firebase/session-votes-service';
import type { GameSession } from '@/lib/firebase/types';
import { shouldActivatePauseFromVote } from '@/lib/online/voting/pause-vote';
import { shouldFinishFromEarlyVote } from '@/lib/online/voting/early-finish-vote';
import { shouldApplyAddTimeFromVote } from '@/lib/online/voting/add-time-vote';
import { shouldResumeFromVote } from '@/lib/online/voting/resume-vote';
import { getServerNow } from '@/lib/firebase/server-clock';

/**
 * When a peer goes offline, open votes may become ready (empty required set).
 * The backgrounding client may not finish reconcile before suspend — remaining
 * clients commit via this effect.
 */
export function useReconcileOpenVotesOnPresence(
  gameId: string | undefined,
  session: GameSession | null | undefined,
  enabled: boolean,
): void {
  const signatureRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !gameId || !session || session.status !== 'playing') {
      return;
    }

    const pauseVote = session.pauseVote;
    const earlyVote = session.earlyFinishVote;
    const addTimeVote = session.addTimeVote;
    const resumeVote = session.resumeVote;
    if (!pauseVote && !earlyVote && !addTimeVote && !resumeVote) {
      return;
    }

    const now = getServerNow();
    const ready =
      (pauseVote != null && shouldActivatePauseFromVote(session, pauseVote)) ||
      (earlyVote != null && shouldFinishFromEarlyVote(session, earlyVote, now)) ||
      (addTimeVote != null && shouldApplyAddTimeFromVote(session, addTimeVote)) ||
      (resumeVote != null &&
        session.pauseState?.active === true &&
        shouldResumeFromVote(session, resumeVote, now));

    if (!ready) {
      return;
    }

    const presenceSig = Object.entries(session.players)
      .map(([id, p]) => `${id}:${p.online === true ? 1 : 0}:${p.hasLeft === true ? 1 : 0}`)
      .sort()
      .join('|');
    const voteSig = [
      pauseVote ? 'p' : '',
      earlyVote ? 'e' : '',
      addTimeVote ? 'a' : '',
      resumeVote ? 'r' : '',
    ].join('');
    const signature = `${presenceSig}#${voteSig}`;
    if (signatureRef.current === signature) {
      return;
    }
    signatureRef.current = signature;
    void reconcileOpenSessionVotes(gameId);
  }, [enabled, gameId, session]);
}
