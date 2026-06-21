import AsyncStorage from '@react-native-async-storage/async-storage';

import i18n from '@/i18n';

import { normalizeRoomCode } from '../firebase/room-code.js';
import { toDisplayUpper } from '../dictionary/normalize.js';

import { notifyRoundFinished } from './round-finished-notification.js';
import { onlineRoundKey } from './processed-online-rounds.js';

const NOTIFIED_KEY = 'wordreapers.roundFinishedNotified';

type NotifiedStore = Record<string, number>;

async function readNotifiedStore(): Promise<NotifiedStore> {
  const raw = await AsyncStorage.getItem(NOTIFIED_KEY);
  if (raw == null || raw === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object') {
      return {};
    }
    return parsed as NotifiedStore;
  } catch {
    return {};
  }
}

async function writeNotifiedStore(store: NotifiedStore): Promise<void> {
  await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(store));
}

/** Whether this device already recorded a finished-round notification for the round. */
export async function isRoundFinishedNotified(
  gameId: string,
  baseWordRound: number,
): Promise<boolean> {
  const store = await readNotifiedStore();
  return Boolean(store[onlineRoundKey(normalizeRoomCode(gameId), baseWordRound)]);
}

/**
 * Local push once per device per round (left screen, sync coordinator, home foreground).
 */
export async function notifyRoundFinishedOnce(
  gameId: string,
  baseWordRound: number,
  baseWord: string,
): Promise<boolean> {
  const key = onlineRoundKey(normalizeRoomCode(gameId), baseWordRound);
  const store = await readNotifiedStore();
  if (store[key]) {
    return false;
  }

  const sent = await notifyRoundFinished({
    gameId: normalizeRoomCode(gameId),
    title: i18n.t('game.roundFinishedNotificationTitle'),
    body: i18n.t('game.roundFinishedNotificationBody', {
      word: toDisplayUpper(baseWord),
    }),
  });

  if (!sent) {
    return false;
  }

  store[key] = Date.now();
  await writeNotifiedStore(store);
  return true;
}
