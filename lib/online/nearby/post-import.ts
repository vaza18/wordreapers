import { useNearbyArchivesStore } from '@/store/nearby-archives-store';

import type { FinishedRoundArchive } from '../session/online-session-archive.js';

/**
 * After peer imports: bump history revision only.
 * Profile stats backfill / finalize from peer archives is disabled in v1.
 */
export async function applyPostImportEffects(input: {
  importedArchives: readonly FinishedRoundArchive[];
}): Promise<void> {
  if (input.importedArchives.length === 0) {
    return;
  }
  useNearbyArchivesStore.getState().bumpRevision();
}
