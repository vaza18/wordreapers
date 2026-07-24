import { runRtdbTransaction } from '../firebase/rtdb-transaction.js';

import type { OrganizerSoloWord } from '@/store/organizer-solo-store';

import { devLogAction } from '../debug/dev-log.js';
import type { PlayerProfile } from '../profile/player-profile.js';
import { ensureAnonymousAuth } from '../firebase/auth.js';
import { markPlayerOnline } from '../firebase/game-session-service.js';
import { sessionRef } from '../firebase/session-ref.js';
import { reserveUniqueRoomCode } from '../firebase/reserve-room-code.js';
import { getServerNow } from '../firebase/server-clock.js';
import {
  defaultGameSessionSettings,
  resolveGameSessionSettings,
} from '../firebase/session-settings.js';
import type { StoredPlayerWord } from '../firebase/player-words-service.js';
import type {
  GameSession,
  GameSessionPlayer,
  GameSessionSettings,
  SessionWordMaps,
} from '../firebase/types.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

import {
  setLocalRoomPublishedGameId,
  updateLocalRoomDraft,
  type LocalRoomDraft,
  type LocalRoomSetup,
} from './local-room-draft.js';
import { buildPlayingSoloTimerFields } from './publish-playing-solo-fields.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';
import { restoreSessionWordsToRtdb } from './session/restore-session-words-to-rtdb.js';

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

function buildWordSessionMaps(
  words: readonly OrganizerSoloWord[],
  organizerUid: string,
): SessionWordMaps {
  const wordPlayers: Record<string, Record<string, boolean>> = {};
  for (const word of words) {
    wordPlayers[word.normalized] = {
      ...(wordPlayers[word.normalized] ?? {}),
      [organizerUid]: true,
    };
  }
  return { wordPlayers };
}

async function writeSession(
  gameId: string,
  session: GameSession,
  organizerUid: string,
): Promise<void> {
  const result = await runRtdbTransaction(sessionRef(gameId), (current) => {
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
  const serverNow = getServerNow();

  const session: GameSession = {
    baseWord: input.setup.baseWord,
    status: 'waiting',
    settings,
    timerEndsAt: null,
    organizerId: input.organizerUid,
    createdAt: serverNow,
    players: {
      [input.organizerUid]: profileToPlayer(input.draft.profile),
    },
    baseWordPickerOrder: [input.organizerUid],
    baseWordRound: 0,
    baseWordPickerUid: input.organizerUid,
  };

  await writeSession(gameId, session, input.organizerUid);
  await markPlayerOnline(gameId, input.organizerUid);

  updateLocalRoomDraft(input.draft.draftId, { setup: input.setup, publishedGameId: gameId });
  setLocalRoomPublishedGameId(input.draft.draftId, gameId);
  setOrganizerWaitingRoom(gameId);

  devLogAction('created room', {
    actor: input.draft.profile.name,
    room: gameId,
    round: 0,
    details: input.setup.baseWord ? `baseWord="${input.setup.baseWord}"` : 'no base word yet',
  });

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
  /** Solo countdown budget (duration + local add-time) for timer-based results duration. */
  roundTimerBudgetSeconds?: number;
}

/**
 * Publish an in-progress solo round so guests can join the active game (variant A).
 */
export async function publishPlayingSoloRound(input: PublishPlayingSoloInput): Promise<string> {
  const gameId = await reserveUniqueRoomCode(input.draft.preferredCode, input.organizerUid);
  const normalized = normalizeRoomCode(gameId);
  const settings = settingsFromSetup(input.setup, 1);
  const serverNow = getServerNow();
  const { timerEndsAt, pauseState } = buildPlayingSoloTimerFields(
    input.remainingMs,
    input.paused,
    serverNow,
  );
  const wordMaps = buildWordSessionMaps(input.words, input.organizerUid);

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
    roundStartedAt: serverNow,
    createdAt: serverNow,
    roundTimerBudgetSeconds:
      input.roundTimerBudgetSeconds ?? resolveGameSessionSettings(settings).durationSeconds,
    organizerId: input.organizerUid,
    players: {
      [input.organizerUid]: player,
    },
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
        at: word.at,
      };
    }
    await restoreSessionWordsToRtdb(normalized, wordMaps, {
      [input.organizerUid]: record,
    });
  }

  await markPlayerOnline(normalized, input.organizerUid);

  updateLocalRoomDraft(input.draft.draftId, { setup: input.setup, publishedGameId: gameId });
  setLocalRoomPublishedGameId(input.draft.draftId, gameId);

  devLogAction('published playing solo round', {
    actor: input.draft.profile.name,
    room: normalized,
    round: 0,
    details: `baseWord="${input.setup.baseWord}"`,
  });

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
    roundTimerBudgetSeconds?: number;
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
