import { router } from 'expo-router';
import { useEffect } from 'react';

import { loadExpoNotifications } from '@/lib/native/load-expo-notifications';
import { parseRoundFinishedNotificationData } from '@/lib/online/round-finished-notification-data';
import { onlineResultsRoute } from '@/lib/online/online-results-route';
import { runOnlineSyncNow } from '@/hooks/useOnlineSyncCoordinator';
import { useFirebaseStore } from '@/store/firebase-store';

/** Navigate to the pinned finished round from a round-finished notification tap. */
export async function openResultsFromRoundFinishedNotification(data: {
  gameId: string;
  baseWordRound: number;
}): Promise<void> {
  const uid = useFirebaseStore.getState().uid;
  await runOnlineSyncNow('', uid);
  router.push(onlineResultsRoute(data.gameId, data.baseWordRound));
}

/**
 * Wire notification taps to the archived results screen for that round.
 */
export function useRoundFinishedNotificationRouting(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      const Notifications = await loadExpoNotifications();
      if (!Notifications || cancelled) {
        return;
      }

      const response = await Notifications.getLastNotificationResponseAsync();
      const lastData = parseRoundFinishedNotificationData(
        response?.notification.request.content.data,
      );
      if (lastData) {
        void openResultsFromRoundFinishedNotification(lastData);
      }

      sub = Notifications.addNotificationResponseReceivedListener((incoming) => {
        const data = parseRoundFinishedNotificationData(incoming.notification.request.content.data);
        if (data) {
          void openResultsFromRoundFinishedNotification(data);
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
}
