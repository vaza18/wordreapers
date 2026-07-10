import { tGendered, type PlayerGender } from '../game/grammar.js';
import { displayPlayerName } from './public-lobby/display-player-name.js';
import { playerGenderForDisplay } from './public-lobby/session-identity.js';
import type { GameSession } from '../firebase/types.js';
import { playToastVariantForEvent, type PlayToastVariant } from './play-toast-display.js';
import type { PlayToastEvent } from './play-toast-events.js';

export { playToastVariantForEvent, type PlayToastVariant } from './play-toast-display.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function toastPlayerLabel(
  session: GameSession,
  viewerUid: string,
  playerId: string,
): { name: string; gender: PlayerGender } {
  const player = session.players[playerId];
  if (!player) {
    return { name: playerId, gender: null };
  }
  return {
    name: displayPlayerName(player, viewerUid, playerId, session),
    gender: playerGenderForDisplay(session, viewerUid, playerId),
  };
}

export interface PlayToastDisplayItem {
  message: string;
  variant: PlayToastVariant;
}

/**
 * Format one play-session toast for the Ukrainian UI.
 */
export function formatPlayToastEvent(
  t: TranslateFn,
  event: PlayToastEvent,
  viewerGender: PlayerGender,
  session: GameSession,
  viewerUid: string,
): string {
  switch (event.type) {
    case 'player_joined': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      const inviterUid = session.players[event.playerId]?.invitedBy;
      if (inviterUid && inviterUid !== viewerUid && session.players[inviterUid]) {
        const inviter = toastPlayerLabel(session, viewerUid, inviterUid);
        return tGendered(t, 'game.toastPlayerJoinedInvite', gender, {
          name,
          inviter: inviter.name,
        });
      }
      return tGendered(t, 'game.toastPlayerJoined', gender, { name });
    }
    case 'player_left': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      return tGendered(t, 'game.toastPlayerLeft', gender, {
        name,
        rank: event.rank,
      });
    }
    case 'player_went_offline': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      return tGendered(t, 'game.toastPlayerWentOffline', gender, { name });
    }
    case 'player_returned': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      return tGendered(t, 'game.toastPlayerReturned', gender, { name });
    }
    case 'alone_in_game':
      return tGendered(t, 'game.toastAloneInGame', viewerGender);
    case 'overtook_me': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      return tGendered(t, 'game.toastOvertookMe', gender, { name });
    }
    case 'yielded_to_me': {
      const { name, gender } = toastPlayerLabel(session, viewerUid, event.playerId);
      return tGendered(t, 'game.toastYieldedToMe', gender, { name });
    }
  }
}

export function formatPlayToastEvents(
  t: TranslateFn,
  events: readonly PlayToastEvent[],
  viewerGender: PlayerGender,
  session: GameSession,
  viewerUid: string,
): PlayToastDisplayItem[] {
  return events.map((event) => ({
    message: formatPlayToastEvent(t, event, viewerGender, session, viewerUid),
    variant: playToastVariantForEvent(event),
  }));
}
