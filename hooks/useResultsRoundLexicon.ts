import { useRoundPlayableLexicon } from '@/hooks/useRoundPlayableLexicon';
import type { PlayableLexiconSnapshot } from '@/lib/dictionary/round-playable-lexicon';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';

/**
 * Load or restore the round lexicon for results/history screens.
 */
export function useResultsRoundLexicon(
  session: Pick<GameSession, 'baseWord' | 'settings' | 'players'> | null | undefined,
  archiveSnapshot?: PlayableLexiconSnapshot | null,
) {
  const resolved = session ? resolveGameSessionSettingsForSession(session) : null;
  return useRoundPlayableLexicon({
    baseWord: session?.baseWord ?? '',
    allowProperNouns: resolved?.allowProperNouns ?? false,
    allowSlang: resolved?.allowSlang ?? false,
    archiveSnapshot: archiveSnapshot ?? null,
    enabled: Boolean(session?.baseWord),
  });
}
