import type { PlayToastEvent } from './play-toast-events.js';

export type PlayToastVariant = 'default' | 'success' | 'warning';

export function playToastVariantForEvent(event: PlayToastEvent): PlayToastVariant {
  switch (event.type) {
    case 'yielded_to_me':
      return 'success';
    case 'overtook_me':
      return 'warning';
    default:
      return 'default';
  }
}
