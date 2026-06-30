import { useEffect, useState } from 'react';

import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { getFinishedRoundArchive } from '@/lib/online/online-session-archive';

/** Load playable lexicon saved with a finished-round archive. */
export function useArchiveRoundLexicon(
  gameId: string,
  baseWordRound: number | null | undefined,
): PlayableLexiconSnapshot | null {
  const [archiveLexicon, setArchiveLexicon] = useState<PlayableLexiconSnapshot | null>(null);

  useEffect(() => {
    if (!gameId || baseWordRound == null) {
      setArchiveLexicon(null);
      return;
    }
    void getFinishedRoundArchive(gameId, baseWordRound).then((archive) => {
      setArchiveLexicon(archive?.playableLexicon ?? null);
    });
  }, [baseWordRound, gameId]);

  return archiveLexicon;
}
