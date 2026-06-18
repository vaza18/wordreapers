import { router } from 'expo-router';

import { generateRoomCode } from '@/lib/firebase/room-code';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { createLocalRoomDraft } from '@/lib/online/local-room-draft';
import type { PlayerProfile } from '@/lib/profile/player-profile';
import { abandonTrackedOrganizerWaitingRoom } from '@/lib/online/abandon-tracked-waiting-room';
import { useFirebaseStore } from '@/store/firebase-store';

/**
 * Open organizer setup with a local room code (no Firebase until publish).
 */
export async function navigateToNewOnlineRoom(profile: PlayerProfile): Promise<void> {
  const firebase = await ensureFirebaseReady();
  if (firebase?.uid) {
    useFirebaseStore.getState().setConnection({
      status: firebase.status,
      uid: firebase.uid,
      errorMessage: firebase.errorMessage ?? null,
    });
    await abandonTrackedOrganizerWaitingRoom(firebase.uid);
  }

  const code = generateRoomCode();
  createLocalRoomDraft(code, profile);
  router.push({ pathname: '/online/setup', params: { gameId: code } });
}
