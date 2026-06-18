import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

import { purgeExpiredRtdbSessions } from './purge-expired-sessions.js';

admin.initializeApp();

setGlobalOptions({ region: 'europe-west1' });

export const purgeExpiredRtdbSessionsScheduled = onSchedule('every 24 hours', async () => {
  const result = await purgeExpiredRtdbSessions();
  logger.info('purgeExpiredRtdbSessions', result);
});
