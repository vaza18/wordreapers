export const ROUND_FINISHED_NOTIFICATION_TYPE = 'round_finished';

export interface RoundFinishedNotificationData {
  type: typeof ROUND_FINISHED_NOTIFICATION_TYPE;
  gameId: string;
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
  return {
    type: ROUND_FINISHED_NOTIFICATION_TYPE,
    gameId: record.gameId,
  };
}
