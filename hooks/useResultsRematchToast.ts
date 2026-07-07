import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { tGendered } from '@/lib/game/grammar';
import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import { detectRematchToastEvent } from '@/lib/online/rematch/rematch-toast-events';
import { useProfileStore } from '@/store/profile-store';

import { type PlayToastItem, useToastQueue } from './useToastQueue';

/**
 * Toast when another player reopens the room for rematch while viewing results.
 */
export function useResultsRematchToast(
  liveSession: GameSessionSnapshot | null,
  myUid: string,
  skipNextRef: RefObject<boolean>,
): PlayToastItem[] {
  const { t } = useTranslation();
  const viewerGender = useProfileStore((state) => state.gender);
  const { toasts, enqueueToasts } = useToastQueue();
  const prevSessionRef = useRef<GameSessionSnapshot | null>(null);

  useEffect(() => {
    const prev = prevSessionRef.current;
    prevSessionRef.current = liveSession;

    if (!liveSession) {
      return;
    }

    if (skipNextRef.current) {
      if (liveSession.status === 'waiting') {
        skipNextRef.current = false;
      }
      return;
    }

    const event = detectRematchToastEvent(prev, liveSession);
    if (!event || !myUid) {
      return;
    }

    const picker = liveSession.players[event.pickerId];
    const pickerName = picker
      ? displayPlayerName(picker, myUid, event.pickerId, liveSession)
      : event.pickerName;

    enqueueToasts([
      {
        message: tGendered(t, 'game.toastRematchRound', viewerGender, {
          name: pickerName,
          n: event.roundNumber,
        }),
      },
    ]);
  }, [enqueueToasts, liveSession, myUid, skipNextRef, t, viewerGender]);

  return toasts;
}
