import { getCachedRoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon-cache';
import {
  toPlayableLexiconSnapshot,
  type PlayableLexiconSnapshot,
} from '@/lib/dictionary/round-playable-lexicon';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';

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
