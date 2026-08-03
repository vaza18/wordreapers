import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import { overlapPeersFromSession } from '@/lib/game/word-overlap-peers';
import { globalWordCount } from '@/lib/firebase/session-word-maps';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { GameSession } from '@/lib/firebase/types';
import { resolvePlayerWordDisplay } from './player-word-display.js';
import { compareUk } from '@/lib/i18n/uk-collator';

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
 * Build word list rows for UI from normalized words + live session state.
 */
export function buildOnlineWordListDisplay(
  myWords: ReadonlySet<string> | readonly string[],
  session: GameSession,
  viewerPlayerId: string,
  displays?: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): { entries: OnlineWordListRow[]; displays: string[] } {
  const entries: OnlineWordListRow[] = [];
  const displayList: string[] = [];
  const normalizedList = [...myWords].sort(compareUk);
  for (const normalized of normalizedList) {
    const entry = resolveOnlineWordEntry(normalized, session);
    entries.push({
      ...entry,
      overlapPeers: overlapPeersFromSession(normalized, session, viewerPlayerId),
    });
    displayList.push(resolvePlayerWordDisplay(normalized, displays));
  }
  return { entries, displays: displayList };
}
