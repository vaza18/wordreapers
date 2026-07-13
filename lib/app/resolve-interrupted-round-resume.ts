import type { SoloRoundSnapshotV1 } from '../game/solo-round-snapshot.js';
import type { GameSession } from '../firebase/types.js';
import {
  shouldResumePausedOnline,
  type PausedOnlineResumePointer,
} from '../online/session/paused-online-resume.js';

/** Cold-start navigation target after an interrupted round. */
export type InterruptedRoundResumeTarget =
  { kind: 'solo'; gameId: string } | { kind: 'onlinePaused'; gameId: string };

/** Injectable IO used by {@link resolveInterruptedRoundResume}. */
export interface ResolveInterruptedRoundResumeDeps {
  loadSolo: () => Promise<SoloRoundSnapshotV1 | null>;
  applySolo: (snapshot: SoloRoundSnapshotV1) => void;
  loadOnlinePointer: () => Promise<PausedOnlineResumePointer | null>;
  fetchSession: (gameId: string) => Promise<GameSession | null>;
  getUid: () => string | null;
  clearOnlinePointer: () => Promise<void>;
}

/**
 * Decide cold-start navigation: solo snapshot first, else verified paused online room.
 */
export async function resolveInterruptedRoundResume(
  deps: ResolveInterruptedRoundResumeDeps,
): Promise<InterruptedRoundResumeTarget | null> {
  const solo = await deps.loadSolo();
  if (solo) {
    deps.applySolo(solo);
    return { kind: 'solo', gameId: solo.draftId };
  }

  const pointer = await deps.loadOnlinePointer();
  if (!pointer) {
    return null;
  }

  const uid = deps.getUid() ?? pointer.uid;
  let session: GameSession | null;
  try {
    session = await deps.fetchSession(pointer.gameId);
  } catch {
    // Keep pointer for a later launch when network/Firebase is available.
    return null;
  }

  if (shouldResumePausedOnline(pointer, session, uid)) {
    return { kind: 'onlinePaused', gameId: pointer.gameId };
  }

  await deps.clearOnlinePointer();
  return null;
}

/** Expo Router href for a resolved interrupted-round resume target. */
export function resumeTargetHref(target: InterruptedRoundResumeTarget): {
  pathname: '/online/solo/[gameId]' | '/online/play/[gameId]';
  params: { gameId: string };
} {
  if (target.kind === 'solo') {
    return { pathname: '/online/solo/[gameId]', params: { gameId: target.gameId } };
  }
  return { pathname: '/online/play/[gameId]', params: { gameId: target.gameId } };
}
