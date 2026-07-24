import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import { logObservedPlayToastEvents } from '@/lib/debug/log-observed-play-toasts';
import { detectPlayToastEvents, detectRankEvents } from '@/lib/online/play-toast-events';
import {
  playToastRankSignature,
  playToastRosterSignature,
} from '@/lib/online/play-toast-session-signature';
import { formatPlayToastEvents } from '@/lib/online/format-play-toast';
import {
  isPresenceToastEvent,
  PRESENCE_TOAST_DEBOUNCE_MS,
  resolvePendingPresenceToast,
  type PresenceToastEvent,
} from '@/lib/online/presence-toast-coalesce';
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

/** Coalesce split RTDB score updates into one net rank toast. */
export const PLAY_TOAST_RANK_DEBOUNCE_MS = 400;

function detectRosterToastEvents(
  prev: GameSessionSnapshot,
  curr: GameSessionSnapshot,
  myUid: string,
) {
  return detectPlayToastEvents(prev, curr, myUid).filter(
    (event) => event.type !== 'overtook_me' && event.type !== 'yielded_to_me',
  );
}

/**
 * Short-lived roster / standings toasts while an online round is in progress.
 * Roster diffs use core session; rank diffs use word-map standings with debounce.
 * Presence offline↔returned flips are debounced so contradictory banners do not stack.
 */
export function usePlaySessionToasts(
  rosterSession: GameSessionSnapshot | null,
  rankSession: GameSessionSnapshot | null,
  myUid: string,
  enabled = true,
): PlayToastItem[] {
  const { t } = useTranslation();
  const viewerGender = useProfileStore((state) => state.gender);
  const { toasts, enqueueToasts } = useToastQueue();
  const prevRosterRef = useRef<GameSessionSnapshot | null>(null);
  const rankBaselineRef = useRef<GameSessionSnapshot | null>(null);
  const rankLatestRef = useRef<GameSessionSnapshot | null>(null);
  const rankDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presencePendingRef = useRef<
    Map<string, { event: PresenceToastEvent; timer: ReturnType<typeof setTimeout> }>
  >(new Map());
  const rosterSessionRef = useRef(rosterSession);
  const rankSessionRef = useRef(rankSession);
  rosterSessionRef.current = rosterSession;
  rankSessionRef.current = rankSession;

  const rosterSignature =
    enabled && rosterSession && rosterSession.status === 'playing' && myUid
      ? playToastRosterSignature(rosterSession)
      : null;

  const rankSignature =
    enabled && rankSession && rankSession.status === 'playing' && myUid
      ? playToastRankSignature(rankSession)
      : null;

  useEffect(() => {
    const pending = presencePendingRef.current;
    return () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
      }
      pending.clear();
    };
  }, []);

  useEffect(() => {
    const current = rosterSessionRef.current;
    if (!enabled || !current || current.status !== 'playing' || !myUid) {
      prevRosterRef.current = current;
      return;
    }

    const prev = prevRosterRef.current;
    prevRosterRef.current = current;
    if (!prev || prev.id !== current.id || prev.status !== 'playing') {
      return;
    }

    const events = detectRosterToastEvents(prev, current, myUid);
    const presenceEvents = events.filter(isPresenceToastEvent);
    const otherEvents = events.filter((event) => !isPresenceToastEvent(event));

    logObservedPlayToastEvents(events, current.id, current.baseWordRound ?? 0);

    const otherItems = formatPlayToastEvents(t, otherEvents, viewerGender, current, myUid);
    enqueueToasts(otherItems);

    for (const event of presenceEvents) {
      const existing = presencePendingRef.current.get(event.playerId) ?? null;
      const resolved = resolvePendingPresenceToast(existing?.event ?? null, event);
      if (existing) {
        clearTimeout(existing.timer);
        presencePendingRef.current.delete(event.playerId);
      }
      if (resolved.cancel || !resolved.pending) {
        continue;
      }
      const pendingEvent = resolved.pending;
      const sessionForFormat = current;
      const timer = setTimeout(() => {
        presencePendingRef.current.delete(pendingEvent.playerId);
        const live = rosterSessionRef.current;
        if (!live || live.status !== 'playing') {
          return;
        }
        enqueueToasts(
          formatPlayToastEvents(t, [pendingEvent], viewerGender, sessionForFormat, myUid),
        );
      }, PRESENCE_TOAST_DEBOUNCE_MS);
      presencePendingRef.current.set(pendingEvent.playerId, { event: pendingEvent, timer });
    }
  }, [enabled, enqueueToasts, myUid, rosterSignature, t, viewerGender]);

  useEffect(() => {
    if (!enabled || !myUid) {
      rankBaselineRef.current = null;
      rankLatestRef.current = null;
      if (rankDebounceRef.current) {
        clearTimeout(rankDebounceRef.current);
        rankDebounceRef.current = null;
      }
      return undefined;
    }

    const current = rankSessionRef.current;
    if (!current || current.status !== 'playing') {
      rankBaselineRef.current = current;
      rankLatestRef.current = current;
      return undefined;
    }

    rankLatestRef.current = current;
    if (!rankBaselineRef.current || rankBaselineRef.current.id !== current.id) {
      rankBaselineRef.current = current;
      return undefined;
    }

    if (rankDebounceRef.current) {
      clearTimeout(rankDebounceRef.current);
    }

    rankDebounceRef.current = setTimeout(() => {
      rankDebounceRef.current = null;
      const prev = rankBaselineRef.current;
      const latest = rankLatestRef.current;
      if (!prev || !latest || prev.status !== 'playing' || latest.status !== 'playing') {
        rankBaselineRef.current = latest;
        return;
      }
      rankBaselineRef.current = latest;
      const events = detectRankEvents(prev, latest, myUid);
      const items = formatPlayToastEvents(t, events, viewerGender, latest, myUid);
      enqueueToasts(items);
    }, PLAY_TOAST_RANK_DEBOUNCE_MS);

    return () => {
      if (rankDebounceRef.current) {
        clearTimeout(rankDebounceRef.current);
        rankDebounceRef.current = null;
      }
    };
  }, [enabled, enqueueToasts, myUid, rankSignature, t, viewerGender]);

  return toasts;
}
