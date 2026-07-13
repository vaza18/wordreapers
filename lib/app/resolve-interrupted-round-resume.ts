import type { SoloRoundSnapshotV1 } from '../game/solo-round-snapshot.js';
import type { GameSession } from '../firebase/types.js';
import {
  shouldResumeLeftOnline,
  type LeftOnlineResumePointer,
} from '../online/session/left-online-resume.js';
import {
  shouldResumePausedOnline,
  type PausedOnlineResumePointer,
} from '../online/session/paused-online-resume.js';

/** Cold-start navigation target after an interrupted round. */
export type InterruptedRoundResumeTarget =
  | { kind: 'solo'; gameId: string }
  | { kind: 'onlinePaused'; gameId: string }
  | { kind: 'onlineLeft'; gameId: string };

/** Injectable IO used by {@link resolveInterruptedRoundResume}. */
export interface ResolveInterruptedRoundResumeDeps {
  loadSolo: () => Promise<SoloRoundSnapshotV1 | null>;
  applySolo: (snapshot: SoloRoundSnapshotV1) => void;
  loadPausedPointer: () => Promise<PausedOnlineResumePointer | null>;
  clearPausedPointer: () => Promise<void>;
  loadLeftPointer: () => Promise<LeftOnlineResumePointer | null>;
  clearLeftPointer: () => Promise<void>;
  fetchSession: (gameId: string) => Promise<GameSession | null>;
  getUid: () => string | null;
}

/**
 * Decide cold-start navigation: solo → paused online → left-round screen → none.
 */
export async function resolveInterruptedRoundResume(
  deps: ResolveInterruptedRoundResumeDeps,
): Promise<InterruptedRoundResumeTarget | null> {
  const solo = await deps.loadSolo();
  if (solo) {
    deps.applySolo(solo);
    return { kind: 'solo', gameId: solo.draftId };
  }

  const pausedPointer = await deps.loadPausedPointer();
  if (pausedPointer) {
    const uid = deps.getUid() ?? pausedPointer.uid;
    let session: GameSession | null;
    try {
      session = await deps.fetchSession(pausedPointer.gameId);
    } catch {
      // Keep pointer for a later launch when network/Firebase is available.
      return null;
    }

    if (shouldResumePausedOnline(pausedPointer, session, uid)) {
      return { kind: 'onlinePaused', gameId: pausedPointer.gameId };
    }

    await deps.clearPausedPointer();
  }

  const leftPointer = await deps.loadLeftPointer();
  if (!leftPointer) {
    return null;
  }

  const uid = deps.getUid() ?? leftPointer.uid;
  let session: GameSession | null;
  try {
    session = await deps.fetchSession(leftPointer.gameId);
  } catch {
    return null;
  }

  if (shouldResumeLeftOnline(leftPointer, session, uid)) {
    return { kind: 'onlineLeft', gameId: leftPointer.gameId };
  }

  await deps.clearLeftPointer();
  return null;
}

/** Expo Router href for a resolved interrupted-round resume target. */
export function resumeTargetHref(target: InterruptedRoundResumeTarget): {
  pathname: '/online/solo/[gameId]' | '/online/play/[gameId]' | '/online/left/[gameId]';
  params: { gameId: string };
} {
  if (target.kind === 'solo') {
    return { pathname: '/online/solo/[gameId]', params: { gameId: target.gameId } };
  }
  if (target.kind === 'onlinePaused') {
    return { pathname: '/online/play/[gameId]', params: { gameId: target.gameId } };
  }
  return { pathname: '/online/left/[gameId]', params: { gameId: target.gameId } };
}
