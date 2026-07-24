import type { PlayToastEvent } from './play-toast-events.js';

export const PRESENCE_TOAST_DEBOUNCE_MS = 700;

export type PresenceToastEvent = Extract<
  PlayToastEvent,
  { type: 'player_went_offline' | 'player_returned' }
>;

export function isPresenceToastEvent(event: PlayToastEvent): event is PresenceToastEvent {
  return event.type === 'player_went_offline' || event.type === 'player_returned';
}

export function isOppositePresenceToast(
  a: PresenceToastEvent['type'],
  b: PresenceToastEvent['type'],
): boolean {
  return a !== b;
}

/**
 * Resolve a pending presence toast when a new offline/returned event arrives for the same player.
 * Opposite flip within the debounce window cancels both (net no-op).
 */
export function resolvePendingPresenceToast(
  pending: PresenceToastEvent | null,
  next: PresenceToastEvent,
): { pending: PresenceToastEvent | null; emit: PresenceToastEvent | null; cancel: boolean } {
  if (!pending || pending.playerId !== next.playerId) {
    return { pending: next, emit: null, cancel: false };
  }
  if (isOppositePresenceToast(pending.type, next.type)) {
    return { pending: null, emit: null, cancel: true };
  }
  // Same direction — keep the latest payload, still waiting to emit.
  return { pending: next, emit: null, cancel: false };
}
