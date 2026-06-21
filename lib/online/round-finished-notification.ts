import { Platform } from 'react-native';

import { loadExpoNotifications } from '../native/load-expo-notifications.js';

import {
  ROUND_FINISHED_NOTIFICATION_TYPE,
  type RoundFinishedNotificationData,
} from './round-finished-notification-data.js';

export { parseRoundFinishedNotificationData } from './round-finished-notification-data.js';
export type { RoundFinishedNotificationData } from './round-finished-notification-data.js';

export async function ensureNotificationPermissions(): Promise<boolean> {
  const Notifications = await loadExpoNotifications();
  if (!Notifications) {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('round-results', {
      name: 'Результати раунду',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notifyRoundFinished(params: {
  gameId: string;
  title: string;
  body: string;
}): Promise<boolean> {
  const Notifications = await loadExpoNotifications();
  if (!Notifications) {
    return false;
  }

  const granted = await ensureNotificationPermissions();
  if (!granted) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      data: {
        type: ROUND_FINISHED_NOTIFICATION_TYPE,
        gameId: params.gameId,
      } satisfies RoundFinishedNotificationData,
    },
    trigger: null,
  });
  return true;
}
