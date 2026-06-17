import { ref, runTransaction, set } from 'firebase/database';

import type { OrganizerSoloWord } from '@/store/organizer-solo-store';

import type { PlayerProfile } from '../profile/player-profile.js';
import { ensureAnonymousAuth } from '../firebase/auth.js';
import { markPlayerOnline } from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath, playerWordsPath } from '../firebase/paths.js';
import { reserveUniqueRoomCode } from '../firebase/reserve-room-code.js';
import { getServerNow } from '../firebase/server-clock.js';
import {
  defaultGameSessionSettings,
  resolveGameSessionSettings,
} from '../firebase/session-settings.js';
import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import type { GameSession, GameSessionPlayer, GameSessionSettings } from '../firebase/types.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

import {
  setLocalRoomPublishedGameId,
  updateLocalRoomDraft,
  type LocalRoomDraft,
  type LocalRoomSetup,
} from './local-room-draft.js';
import { buildPlayingSoloTimerFields } from './publish-playing-solo-fields.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';

function sessionRef(gameId: string) {
  return ref(getFirebaseDatabase(), gameSessionPath(gameId));
}

function profileToPlayer(profile: PlayerProfile): GameSessionPlayer {
  const player: GameSessionPlayer = {
    name: profile.name.trim(),
    avatarColorIndex: profile.avatarColorIndex,
    wordCount: 0,
    score: 0,
    online: true,
  };
  if (profile.gender === 'm' || profile.gender === 'f') {
    player.gender = profile.gender;
  }
  return player;
}

function settingsFromSetup(setup: LocalRoomSetup, playerCount: number): GameSessionSettings {
  return defaultGameSessionSettings(
    setup.durationMinutes,
    setup.uniqueBonusMode,
    setup.allowProperNouns,
    setup.allowSlang,
    playerCount,
  );
}

function buildWordSessionFields(
  words: readonly OrganizerSoloWord[],
  organizerUid: string,
): {
  wordCounts: Record<string, number>;
  wordFirst: Record<string, string>;
  wordPlayers: Record<string, Record<string, boolean>>;
} {
  const wordCounts: Record<string, number> = {};
  const wordFirst: Record<string, string> = {};
  const wordPlayers: Record<string, Record<string, boolean>> = {};
  for (const word of words) {
    wordCounts[word.normalized] = (wordCounts[word.normalized] ?? 0) + 1;
    if (!wordFirst[word.normalized]) {
      wordFirst[word.normalized] = organizerUid;
    }
    wordPlayers[word.normalized] = {
      ...(wordPlayers[word.normalized] ?? {}),
      [organizerUid]: true,
    };
  }
  return { wordCounts, wordFirst, wordPlayers };
}

async function writeSession(
  gameId: string,
  session: GameSession,
  organizerUid: string,
): Promise<void> {
  const result = await runTransaction(sessionRef(gameId), (current) => {
    if (current == null) {
      if (session.organizerId !== organizerUid) {
        return undefined;
      }
      return session;
    }
    const existing = current as GameSession;
    if (existing.organizerId !== organizerUid) {
      return undefined;
    }
    return { ...existing, ...session };
  });
  if (!result.committed) {
    throw new Error('ROOM_CODE_CONFLICT');
  }
}

export interface PublishWaitingRoomInput {
  draft: LocalRoomDraft;
  setup: LocalRoomSetup;
  organizerUid: string;
}

/**
 * First Firebase write for the invite path: waiting lobby with organizer only.
 */
export async function publishWaitingRoom(input: PublishWaitingRoomInput): Promise<string> {
  const gameId = await reserveUniqueRoomCode(input.draft.preferredCode, input.organizerUid);
  const settings = settingsFromSetup(input.setup, 1);

  const session: GameSession = {
    baseWord: input.setup.baseWord,
    status: 'waiting',
    settings,
    timerEndsAt: null,
    organizerId: input.organizerUid,
    players: {
      [input.organizerUid]: profileToPlayer(input.draft.profile),
    },
    wordCounts: {},
    wordFirst: {},
    wordPlayers: {},
    baseWordPickerOrder: [input.organizerUid],
    baseWordRound: 0,
  };

  await writeSession(gameId, session, input.organizerUid);
  await markPlayerOnline(gameId, input.organizerUid);

  updateLocalRoomDraft(input.draft.draftId, { setup: input.setup, publishedGameId: gameId });
  setLocalRoomPublishedGameId(input.draft.draftId, gameId);
  setOrganizerWaitingRoom(gameId);

  return gameId;
}

export interface PublishPlayingSoloInput {
  draft: LocalRoomDraft;
  setup: LocalRoomSetup;
  organizerUid: string;
  words: OrganizerSoloWord[];
  score: number;
  wordCount: number;
  remainingMs: number;
  /** True when the organizer paused locally before inviting. */
  paused: boolean;
}

/**
 * Publish an in-progress solo round so guests can join the active game (variant A).
 */
export async function publishPlayingSoloRound(input: PublishPlayingSoloInput): Promise<string> {
  const gameId = await reserveUniqueRoomCode(input.draft.preferredCode, input.organizerUid);
  const normalized = normalizeRoomCode(gameId);
  const settings = settingsFromSetup(input.setup, 1);
  const { timerEndsAt, pauseState } = buildPlayingSoloTimerFields(
    input.remainingMs,
    input.paused,
    getServerNow(),
  );
  const { wordCounts, wordFirst, wordPlayers } = buildWordSessionFields(
    input.words,
    input.organizerUid,
  );

  const player: GameSessionPlayer = {
    ...profileToPlayer(input.draft.profile),
    score: input.score,
    wordCount: input.wordCount,
  };

  const session: GameSession = {
    baseWord: input.setup.baseWord,
    status: 'playing',
    settings: resolveGameSessionSettings(settings),
    timerEndsAt,
    organizerId: input.organizerUid,
    players: {
      [input.organizerUid]: player,
    },
    wordCounts,
    wordFirst,
    wordPlayers,
    baseWordPickerOrder: [input.organizerUid],
    baseWordRound: 0,
    earlyFinishVote: null,
    pauseVote: null,
    resumeVote: null,
    pauseState,
  };

  await writeSession(normalized, session, input.organizerUid);

  if (input.words.length > 0) {
    const record: Record<string, StoredPlayerWord> = {};
    for (const word of input.words) {
      record[word.normalized] = {
        display: word.display,
        kind: word.kind,
        points: word.points,
        badge: word.badge,
        at: word.at,
      };
    }
    await set(ref(getFirebaseDatabase(), playerWordsPath(normalized, input.organizerUid)), record);
  }

  await markPlayerOnline(normalized, input.organizerUid);

  updateLocalRoomDraft(input.draft.draftId, { setup: input.setup, publishedGameId: gameId });
  setLocalRoomPublishedGameId(input.draft.draftId, gameId);

  return gameId;
}

/** Ensure anonymous auth before publishing. */
export async function publishWaitingRoomForDraft(
  draft: LocalRoomDraft,
  setup: LocalRoomSetup,
): Promise<string> {
  const user = await ensureAnonymousAuth();
  return publishWaitingRoom({ draft, setup, organizerUid: user.uid });
}

export async function publishPlayingSoloForDraft(
  draft: LocalRoomDraft,
  setup: LocalRoomSetup,
  solo: {
    words: OrganizerSoloWord[];
    score: number;
    wordCount: number;
    remainingMs: number;
    paused: boolean;
  },
): Promise<string> {
  const user = await ensureAnonymousAuth();
  return publishPlayingSoloRound({
    draft,
    setup,
    organizerUid: user.uid,
    ...solo,
  });
}
