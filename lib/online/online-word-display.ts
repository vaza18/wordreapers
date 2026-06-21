import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import { overlapPeersFromSession } from '@/lib/game/word-overlap-peers';
import type { StoredPlayerWord } from '@/lib/firebase/player-words-service';
import { globalWordCount } from '@/lib/firebase/session-word-maps';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';

export interface OnlineWordListRow extends ScoredWordEntry {
  overlapPeers: ReturnType<typeof overlapPeersFromSession>;
}

/**
 * Resolve score kind and badge from session-wide word counts.
 */
export function resolveOnlineWordEntry(normalized: string, session: GameSession): ScoredWordEntry {
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(session).uniqueBonusEnabled;
  const globalCount = globalWordCount(session.wordPlayers, normalized);
  const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
  return toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
}

/**
 * Build word list rows for UI from stored words + live session state.
 */
export function buildOnlineWordListDisplay(
  myWords: Map<string, StoredPlayerWord>,
  session: GameSession,
  viewerPlayerId: string,
): { entries: OnlineWordListRow[]; displays: string[] } {
  const sorted = [...myWords.entries()].sort((a, b) => a[1].at - b[1].at);
  return {
    entries: sorted.map(([normalized]) => {
      const entry = resolveOnlineWordEntry(normalized, session);
      return {
        ...entry,
        overlapPeers: overlapPeersFromSession(normalized, session, viewerPlayerId),
      };
    }),
    displays: sorted.map(([, row]) => row.display),
  };
}
