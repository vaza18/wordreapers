import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { detectPlayToastEvents } from '@/lib/online/play-toast-events';
import { formatPlayToastEvents } from '@/lib/online/format-play-toast';
import { useProfileStore } from '@/store/profile-store';

import { type PlayToastItem, useToastQueue } from './useToastQueue';

export {
  PLAY_TOAST_FADE_OUT_MS,
  PLAY_TOAST_FADE_START_MS,
  PLAY_TOAST_VISIBLE_MS,
  type PlayToastItem,
} from './useToastQueue';

/**
 * Short-lived roster / standings toasts while an online round is in progress.
 */
export function usePlaySessionToasts(
  session: GameSessionSnapshot | null,
  myUid: string,
): PlayToastItem[] {
  const { t } = useTranslation();
  const viewerGender = useProfileStore((state) => state.gender);
  const { toasts, enqueueToasts } = useToastQueue();
  const prevSessionRef = useRef<GameSessionSnapshot | null>(null);

  useEffect(() => {
    if (!session || session.status !== 'playing' || !myUid) {
      prevSessionRef.current = session;
      return;
    }

    const prev = prevSessionRef.current;
    prevSessionRef.current = session;
    if (!prev || prev.id !== session.id || prev.status !== 'playing') {
      return;
    }

    const events = detectPlayToastEvents(prev, session, myUid);
    const messages = formatPlayToastEvents(t, events, viewerGender);
    enqueueToasts(messages);
  }, [enqueueToasts, myUid, session, t, viewerGender]);

  return toasts;
}
