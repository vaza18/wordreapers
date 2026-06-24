import type { GameSession } from '../firebase/types.js';
import { displayPlayerName } from '../online/public-lobby/display-player-name.js';
import { playerGenderForDisplay } from '../online/public-lobby/session-identity.js';

import type { PlayerGender } from './grammar.js';

/** Resolve player labels for results (local `player-N` or online Firebase uid). */
export interface ResultsPlayerDirectory {
  getName(playerId: string): string;
  getAvatarColorIndex(playerId: string): number;
  getGender(playerId: string): PlayerGender | null;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Directory for local pass-and-play results.
 */
export function createLocalResultsDirectory(
  playerNames: readonly string[],
  playerGenders: readonly (PlayerGender | null)[] | undefined,
  t: TranslateFn,
): ResultsPlayerDirectory {
  return {
    getName(playerId: string) {
      const index = Number(playerId.replace('player-', ''));
      return playerNames[index] ?? t('game.defaultPlayerName', { index: index + 1 });
    },
    getAvatarColorIndex(playerId: string) {
      return Number(playerId.replace('player-', '')) || 0;
    },
    getGender(playerId: string) {
      const index = Number(playerId.replace('player-', ''));
      return playerGenders?.[index] ?? null;
    },
  };
}

/**
 * Directory for organizer solo round (`solo` player id).
 */
export function createSoloResultsDirectory(
  playerName: string,
  avatarColorIndex: number,
  gender: PlayerGender | null,
): ResultsPlayerDirectory {
  return {
    getName(playerId: string) {
      return playerId === 'solo' ? playerName : playerId;
    },
    getAvatarColorIndex(playerId: string) {
      return playerId === 'solo' ? avatarColorIndex : 0;
    },
    getGender(playerId: string) {
      return playerId === 'solo' ? gender : null;
    },
  };
}

/**
 * Directory for online results (Firebase player uids).
 */
export function createOnlineResultsDirectory(
  session: GameSession,
  viewerUid?: string,
): ResultsPlayerDirectory {
  return {
    getName(playerId: string) {
      const player = session.players[playerId];
      if (!player) {
        return playerId;
      }
      if (viewerUid) {
        return displayPlayerName(player, viewerUid, playerId, session);
      }
      return player.name;
    },
    getAvatarColorIndex(playerId: string) {
      return session.players[playerId]?.avatarColorIndex ?? 0;
    },
    getGender(playerId: string) {
      if (viewerUid) {
        return playerGenderForDisplay(session, viewerUid, playerId);
      }
      return session.players[playerId]?.gender ?? null;
    },
  };
}
