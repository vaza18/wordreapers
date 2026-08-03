import { normalizeRoomCode } from '../firebase/room-code.js';

export const ROUND_FINISHED_NOTIFICATION_TYPE = 'round_finished';

export interface RoundFinishedNotificationData {
  type: typeof ROUND_FINISHED_NOTIFICATION_TYPE;
  gameId: string;
  /** 0-based RTDB round index for the finished round this notification refers to. */
  baseWordRound: number;
}

function parseBaseWordRound(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  // Expo / OS may stringify notification data values.
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      return Math.floor(n);
    }
  }
  return null;
}

export function parseRoundFinishedNotificationData(
  data: unknown,
): RoundFinishedNotificationData | null {
  if (data == null || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== ROUND_FINISHED_NOTIFICATION_TYPE) {
    return null;
  }
  if (typeof record.gameId !== 'string' || record.gameId.length === 0) {
    return null;
  }
  const baseWordRound = parseBaseWordRound(record.baseWordRound);
  if (baseWordRound == null) {
    return null;
  }
  return {
    type: ROUND_FINISHED_NOTIFICATION_TYPE,
    gameId: normalizeRoomCode(record.gameId),
    baseWordRound,
  };
}
