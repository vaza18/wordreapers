import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { detectPlayToastEvents } from '@/lib/online/play-toast-events';
import { playToastSessionSignature } from '@/lib/online/play-toast-session-signature';
import { formatPlayToastEvents } from '@/lib/online/format-play-toast';
import { useProfileStore } from '@/store/profile-store';

import { type PlayToastItem, useToastQueue } from './useToastQueue';

export {
  PLAY_TOAST_FADE_OUT_MS,
  PLAY_TOAST_FADE_START_MS,
  PLAY_TOAST_VISIBLE_MS,
  type PlayToastEnqueueInput,
  type PlayToastItem,
  type PlayToastVariant,
} from './useToastQueue';

/**
 * Short-lived roster / standings toasts while an online round is in progress.
 */
export function usePlaySessionToasts(
  session: GameSessionSnapshot | null,
  myUid: string,
  enabled = true,
): PlayToastItem[] {
  const { t } = useTranslation();
  const viewerGender = useProfileStore((state) => state.gender);
  const { toasts, enqueueToasts } = useToastQueue();
  const prevSessionRef = useRef<GameSessionSnapshot | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const sessionSignature =
    enabled && session && session.status === 'playing' && myUid
      ? playToastSessionSignature(session)
      : null;

  useEffect(() => {
    const current = sessionRef.current;
    if (!enabled || !current || current.status !== 'playing' || !myUid) {
      prevSessionRef.current = current;
      return;
    }

    const prev = prevSessionRef.current;
    prevSessionRef.current = current;
    if (!prev || prev.id !== current.id || prev.status !== 'playing') {
      return;
    }

    const events = detectPlayToastEvents(prev, current, myUid);
    const items = formatPlayToastEvents(t, events, viewerGender, current, myUid);
    enqueueToasts(items);
  }, [enabled, enqueueToasts, myUid, sessionSignature, t, viewerGender]);

  return toasts;
}
