import { isExpoNotificationsAvailable } from './is-expo-notifications-available.js';

type ExpoNotificationsModule = typeof import('expo-notifications');

let cached: ExpoNotificationsModule | null | undefined;
let handlerConfigured = false;

/**
 * Load expo-notifications only when the native module is present (avoids simulator crash on stale builds).
 */
export async function loadExpoNotifications(): Promise<ExpoNotificationsModule | null> {
  if (cached !== undefined) {
    return cached;
  }
  if (!isExpoNotificationsAvailable()) {
    cached = null;
    return null;
  }
  try {
    const Notifications = await import('expo-notifications');
    if (!handlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      handlerConfigured = true;
    }
    cached = Notifications;
    return Notifications;
  } catch {
    cached = null;
    return null;
  }
}
