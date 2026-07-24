import { router } from 'expo-router';

import { generateRoomCode } from '@/lib/firebase/room-code';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { createLocalRoomDraft } from '@/lib/online/local-room-draft';
import type { PlayerProfile } from '@/lib/profile/player-profile';
import { abandonTrackedOrganizerWaitingRoom } from '@/lib/online/abandon-tracked-waiting-room';
import { useFirebaseStore } from '@/store/firebase-store';
import { devLogAction } from '@/lib/debug/dev-log';

function openLocalRoomSetup(profile: PlayerProfile): void {
  const code = generateRoomCode();
  createLocalRoomDraft(code, profile);
  devLogAction('started local room setup', {
    actor: profile.name,
    room: code,
    round: 0,
    level: 'detail',
  });
  router.push({ pathname: '/online/setup', params: { gameId: code } });
}

/**
 * Open organizer setup with a local room code (no Firebase until publish or invite).
 */
export function navigateToLocalRoomSetup(profile: PlayerProfile): void {
  openLocalRoomSetup(profile);
}

/**
 * Open local organizer setup immediately, then bootstrap Firebase in the background.
 * Setup is offline-safe until the player invites others or publishes a room.
 */
export function navigateToNewOnlineRoom(profile: PlayerProfile): void {
  openLocalRoomSetup(profile);
  void prepareFirebaseForOrganizerCreate();
}

async function prepareFirebaseForOrganizerCreate(): Promise<void> {
  const firebase = await ensureFirebaseReady();
  if (!firebase?.uid) {
    return;
  }
  useFirebaseStore.getState().setConnection({
    status: firebase.status,
    uid: firebase.uid,
    errorMessage: firebase.errorMessage ?? null,
  });
  await abandonTrackedOrganizerWaitingRoom(firebase.uid);
}
