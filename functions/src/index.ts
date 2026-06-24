import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

import { guardPublicLobbyWriteHandler } from './guard-public-lobby-write-trigger.js';
import type { PublicLobbyEntry } from './guard-public-lobby-write.js';
import { purgeExpiredRtdbSessions } from './purge-expired-sessions.js';
import { purgeStalePublicLobbies } from './purge-stale-public-lobbies.js';
import { RTDB_REGION, rtdbInstanceId } from './rtdb-config.js';

admin.initializeApp();

setGlobalOptions({ region: RTDB_REGION });

export const guardPublicLobbyWrite = onValueWritten(
  {
    ref: '/public_lobbies/{language}/{gameId}',
    region: RTDB_REGION,
    instance: rtdbInstanceId(),
  },
  async (event) => {
    const language = event.params.language;
    const gameId = event.params.gameId;
    const before = event.data.before.val() as PublicLobbyEntry | null;
    const after = event.data.after.val() as PublicLobbyEntry | null;
    await guardPublicLobbyWriteHandler(language, gameId, before, after);
  },
);

export const purgeExpiredRtdbSessionsScheduled = onSchedule('every 24 hours', async () => {
  const result = await purgeExpiredRtdbSessions();
  logger.info('purgeExpiredRtdbSessions', result);
});

export const purgeStalePublicLobbiesScheduled = onSchedule('every 15 minutes', async () => {
  const result = await purgeStalePublicLobbies();
  logger.info('purgeStalePublicLobbies', result);
});
