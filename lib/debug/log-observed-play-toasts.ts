import { isDevLogEnabled, devLogAction } from './dev-log.js';
import type { PlayToastEvent } from '../online/play-toast-events.js';

/**
 * Log observed remote roster/presence events (detail+). Skips local-only noise like
 * alone_in_game and rank toasts.
 */
export function logObservedPlayToastEvents(
  events: readonly PlayToastEvent[],
  room: string,
  round?: number | null,
): void {
  if (!isDevLogEnabled('detail') || events.length === 0) {
    return;
  }

  for (const event of events) {
    switch (event.type) {
      case 'player_joined':
        devLogAction('joined the round', {
          actor: event.name,
          room,
          round,
          observed: true,
          details: event.inviterName ? `invited by ${event.inviterName}` : undefined,
        });
        break;
      case 'player_left':
        devLogAction('left the round', {
          actor: event.name,
          room,
          round,
          observed: true,
        });
        break;
      case 'player_went_offline':
        devLogAction('went offline', {
          actor: event.name,
          room,
          round,
          observed: true,
        });
        break;
      case 'player_returned':
        devLogAction('returned online', {
          actor: event.name,
          room,
          round,
          observed: true,
        });
        break;
      default:
        break;
    }
  }
}
