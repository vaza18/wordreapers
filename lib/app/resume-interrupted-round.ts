import { get, ref } from 'firebase/database';

import { loadSoloRoundSnapshot, type SoloRoundSnapshotV1 } from '../game/solo-round-snapshot.js';
import { ensureFirebaseReady } from '../firebase/ensure-firebase-ready.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import type { GameSession } from '../firebase/types.js';
import { createLocalRoomDraft, updateLocalRoomDraft } from '../online/local-room-draft.js';
import {
  clearPausedOnlineResume,
  loadPausedOnlineResume,
} from '../online/session/paused-online-resume.js';
import type { PlayerProfile } from '../profile/player-profile.js';
import { useFirebaseStore } from '../../store/firebase-store';
import { useOrganizerSoloStore } from '../../store/organizer-solo-store';
import { useProfileStore } from '../../store/profile-store';

import {
  resolveInterruptedRoundResume,
  resumeTargetHref,
  type InterruptedRoundResumeTarget,
} from './resolve-interrupted-round-resume.js';

export type { InterruptedRoundResumeTarget };
export { resolveInterruptedRoundResume, resumeTargetHref };

async function fetchGameSession(gameId: string): Promise<GameSession | null> {
  const ready = await ensureFirebaseReady();
  if (ready.status !== 'ok' || !ready.uid) {
    throw new Error('FIREBASE_NOT_READY');
  }
  useFirebaseStore.getState().setConnection({
    status: ready.status,
    uid: ready.uid,
    errorMessage: ready.errorMessage ?? null,
  });
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(normalized)));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

function applySoloSnapshot(snapshot: SoloRoundSnapshotV1): void {
  useOrganizerSoloStore.getState().hydrateFromSnapshot(snapshot);
  const profile: PlayerProfile = {
    name: useProfileStore.getState().name,
    gender: useProfileStore.getState().gender,
    avatarColorIndex: useProfileStore.getState().avatarColorIndex,
  };
  createLocalRoomDraft(snapshot.draftId, profile);
  updateLocalRoomDraft(snapshot.draftId, { setup: snapshot.setup });
}

/**
 * Default cold-start resolver wired to stores / AsyncStorage / Firebase.
 */
export async function resolveInterruptedRoundResumeDefault(): Promise<InterruptedRoundResumeTarget | null> {
  return resolveInterruptedRoundResume({
    loadSolo: loadSoloRoundSnapshot,
    applySolo: applySoloSnapshot,
    loadOnlinePointer: loadPausedOnlineResume,
    fetchSession: fetchGameSession,
    getUid: () => useFirebaseStore.getState().uid,
    clearOnlinePointer: clearPausedOnlineResume,
  });
}
