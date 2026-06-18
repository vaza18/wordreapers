import { router } from 'expo-router';
import { useEffect } from 'react';

import { loadExpoNotifications } from '@/lib/native/load-expo-notifications';
import { normalizeRoomCode } from '@/lib/firebase/room-code';
import { parseRoundFinishedNotificationData } from '@/lib/online/round-finished-notification-data';
import { runOnlineSyncNow } from '@/hooks/useOnlineSyncCoordinator';
import { useFirebaseStore } from '@/store/firebase-store';

/** Navigate to results when the user taps a round-finished notification. */
async function openResultsFromNotification(gameId: string): Promise<void> {
  const uid = useFirebaseStore.getState().uid;
  await runOnlineSyncNow('', uid);
  const normalized = normalizeRoomCode(gameId);
  router.push({ pathname: '/online/results/[gameId]', params: { gameId: normalized } });
}

/**
 * Wire notification taps to the archived results screen.
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
        void openResultsFromNotification(lastData.gameId);
      }

      sub = Notifications.addNotificationResponseReceivedListener((incoming) => {
        const data = parseRoundFinishedNotificationData(incoming.notification.request.content.data);
        if (data) {
          void openResultsFromNotification(data.gameId);
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
}
