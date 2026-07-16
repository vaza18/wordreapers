import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import {
  toPlayableLexiconSnapshot,
  type PlayableLexiconSnapshot,
} from '@/lib/dictionary/round-playable-lexicon';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';
import type { LocalRoomSetup } from '@/lib/online/local-room-draft';

/** Read cached round lexicon for archiving (no dictionary reload). */
export function playableLexiconSnapshotForSession(
  session: Pick<GameSession, 'baseWord' | 'settings' | 'players'>,
): PlayableLexiconSnapshot | undefined {
  if (!session.baseWord) {
    return undefined;
  }
  const resolved = resolveGameSessionSettingsForSession(session);
  const cached = getCachedRoundPlayableLexicon(
    session.baseWord,
    resolved.allowProperNouns,
    resolved.allowSlang,
  );
  return cached ? toPlayableLexiconSnapshot(cached) : undefined;
}

/** Read cached round lexicon for solo/local setup persistence (no dictionary reload). */
export function playableLexiconSnapshotForSetup(
  setup: Pick<LocalRoomSetup, 'baseWord' | 'allowProperNouns' | 'allowSlang'>,
): PlayableLexiconSnapshot | undefined {
  const cached = getCachedRoundPlayableLexicon(
    setup.baseWord,
    setup.allowProperNouns,
    setup.allowSlang,
  );
  return cached ? toPlayableLexiconSnapshot(cached) : undefined;
}
