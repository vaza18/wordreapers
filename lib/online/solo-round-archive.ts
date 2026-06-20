import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import type { GameSession } from '../firebase/types.js';
import type { PlayerProfile } from '../profile/player-profile.js';
import { gameSessionSettingsFromSetup } from '../firebase/session-settings.js';
import { computePlayerScore, type ScoredWordEntry } from '../game/scoring.js';

import type { AllPlayerWords } from './clone-player-words.js';
import type { LocalRoomSetup } from './local-room-draft.js';
import { saveFinishedRoundArchive } from './online-session-archive.js';
import type { OrganizerSoloWord } from '@/store/organizer-solo-store';

export function buildSoloFinishedSession(
  setup: LocalRoomSetup,
  words: readonly OrganizerSoloWord[],
  uniqueBonusEnabled: boolean,
  profile: PlayerProfile,
  finishedAtMs?: number,
): GameSession {
  const scored: ScoredWordEntry[] = words.map((word) => ({
    normalized: word.normalized,
    kind: word.kind,
    points: word.points,
    badge: word.badge,
  }));
  const trimmedName = profile.name.trim();

  return {
    baseWord: setup.baseWord,
    status: 'finished',
    settings: gameSessionSettingsFromSetup(
      setup.durationMinutes,
      setup.uniqueBonusMode,
      setup.allowProperNouns,
      setup.allowSlang,
      1,
    ),
    timerEndsAt: null,
    finishedAt: finishedAtMs ?? undefined,
    organizerId: 'solo',
    players: {
      solo: {
        name: trimmedName.length > 0 ? trimmedName : 'solo',
        gender: profile.gender,
        avatarColorIndex: profile.avatarColorIndex,
        wordCount: words.length,
        score: computePlayerScore(scored),
      },
    },
    baseWordRound: 0,
  };
}

export function buildSoloFinishedArchiveWords(words: readonly OrganizerSoloWord[]): AllPlayerWords {
  const soloWords = new Map<string, StoredPlayerWord>();
  for (const word of words) {
    soloWords.set(word.normalized, {
      display: word.display,
      at: word.at,
    });
  }
  return new Map([['solo', soloWords]]);
}

export async function saveSoloFinishedRoundArchive(
  gameId: string,
  setup: LocalRoomSetup,
  words: readonly OrganizerSoloWord[],
  uniqueBonusEnabled: boolean,
  profile: PlayerProfile,
  finishedAtMs?: number,
): Promise<void> {
  const session = buildSoloFinishedSession(setup, words, uniqueBonusEnabled, profile, finishedAtMs);
  const archiveWords = buildSoloFinishedArchiveWords(words);
  await saveFinishedRoundArchive(gameId, session, archiveWords);
}
