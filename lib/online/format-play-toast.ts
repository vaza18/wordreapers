import { tGendered, type PlayerGender } from '../game/grammar.js';
import type { PlayToastEvent } from './play-toast-events.js';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Format one play-session toast for the Ukrainian UI.
 */
export function formatPlayToastEvent(
  t: TranslateFn,
  event: PlayToastEvent,
  viewerGender: PlayerGender,
): string {
  switch (event.type) {
    case 'player_joined':
      if (event.inviterName) {
        return tGendered(t, 'game.toastPlayerJoinedInvite', event.gender, {
          name: event.name,
          inviter: event.inviterName,
        });
      }
      return tGendered(t, 'game.toastPlayerJoined', event.gender, { name: event.name });
    case 'player_left':
      return tGendered(t, 'game.toastPlayerLeft', event.gender, {
        name: event.name,
        rank: event.rank,
      });
    case 'alone_in_game':
      return tGendered(t, 'game.toastAloneInGame', viewerGender);
    case 'overtook_me':
      return tGendered(t, 'game.toastOvertookMe', event.gender, { name: event.name });
    case 'yielded_to_me':
      return tGendered(t, 'game.toastYieldedToMe', event.gender, { name: event.name });
  }
}

export function formatPlayToastEvents(
  t: TranslateFn,
  events: readonly PlayToastEvent[],
  viewerGender: PlayerGender,
): string[] {
  return events.map((event) => formatPlayToastEvent(t, event, viewerGender));
}
