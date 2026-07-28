import { describe, expect, it } from 'vitest';

import { nextPlaySessionLoadError } from '@/lib/online/session/play-session-load-error';

describe('nextPlaySessionLoadError', () => {
  it('clears a sticky room-not-found error when the session recovers', () => {
    expect(
      nextPlaySessionLoadError('Кімнату не знайдено', { id: 'ABCDE' } as never, 'room gone'),
    ).toBeNull();
  });

  it('sets room-not-found when the session is confirmed missing', () => {
    expect(nextPlaySessionLoadError(null, null, 'room gone')).toBe('room gone');
  });

  it('keeps the prior error when still missing', () => {
    expect(nextPlaySessionLoadError('room gone', null, 'room gone')).toBe('room gone');
  });
});
