import { useEffect, useState } from 'react';

import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';
import { getFinishedRoundArchive } from '@/lib/online/session/online-session-archive';

export type UseResultsRoundLexiconOptions = {
  /** Pre-loaded archive snapshot (history screen). */
  archiveSnapshot?: PlayableLexiconSnapshot | null;
  /** Load archive snapshot from local storage when session is live/finished. */
  gameId?: string;
  baseWordRound?: number | null;
};

function isLexiconOptions(
  value: UseResultsRoundLexiconOptions | PlayableLexiconSnapshot | null | undefined,
): value is UseResultsRoundLexiconOptions {
  if (value == null) {
    return false;
  }
  return 'gameId' in value || 'baseWordRound' in value || 'archiveSnapshot' in value;
}

/**
 * Load or restore the round lexicon for results/history screens.
 */
export function useResultsRoundLexicon(
  session: Pick<GameSession, 'baseWord' | 'settings' | 'players'> | null | undefined,
  options?: UseResultsRoundLexiconOptions | PlayableLexiconSnapshot | null,
) {
  const normalizedOptions: UseResultsRoundLexiconOptions = isLexiconOptions(options)
    ? options
    : { archiveSnapshot: options ?? null };

  const { archiveSnapshot: archiveSnapshotProp, gameId, baseWordRound } = normalizedOptions;
  const [loadedArchiveLexicon, setLoadedArchiveLexicon] = useState<PlayableLexiconSnapshot | null>(
    null,
  );

  useEffect(() => {
    if (archiveSnapshotProp != null || !gameId || baseWordRound == null) {
      setLoadedArchiveLexicon(null);
      return;
    }
    void getFinishedRoundArchive(gameId, baseWordRound).then((archive) => {
      setLoadedArchiveLexicon(archive?.playableLexicon ?? null);
    });
  }, [archiveSnapshotProp, baseWordRound, gameId]);

  const archiveSnapshot = archiveSnapshotProp ?? loadedArchiveLexicon;
  const resolved = session ? resolveGameSessionSettingsForSession(session) : null;

  return useRoundPlayableLexicon({
    baseWord: session?.baseWord ?? '',
    allowProperNouns: resolved?.allowProperNouns ?? false,
    allowSlang: resolved?.allowSlang ?? false,
    archiveSnapshot: archiveSnapshot ?? null,
    enabled: Boolean(session?.baseWord),
  });
}
