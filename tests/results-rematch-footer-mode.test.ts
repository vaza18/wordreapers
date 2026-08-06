import { describe, expect, it } from 'vitest';

import { MAX_ROUNDS_PER_ROOM } from '@/constants/max-rounds-per-room';
import { resultsRematchFooterMode } from '@/lib/online/results-rematch-footer-mode';

describe('resultsRematchFooterMode', () => {
  it('uses rematch CTAs before the final round', () => {
    expect(
      resultsRematchFooterMode({
        displayBaseWordRound: 0,
        liveStatus: null,
        liveBaseWordRound: null,
      }),
    ).toBe('rematch');
    expect(
      resultsRematchFooterMode({
        displayBaseWordRound: MAX_ROUNDS_PER_ROOM - 2,
        liveStatus: 'finished',
        liveBaseWordRound: MAX_ROUNDS_PER_ROOM - 2,
      }),
    ).toBe('rematch');
  });

  it('switches to room-complete CTAs on the final displayed round', () => {
    expect(
      resultsRematchFooterMode({
        displayBaseWordRound: MAX_ROUNDS_PER_ROOM - 1,
        liveStatus: null,
        liveBaseWordRound: null,
      }),
    ).toBe('room_complete');
  });

  it('uses room-complete when live finished the final round even if UI is frozen earlier', () => {
    expect(
      resultsRematchFooterMode({
        displayBaseWordRound: 2,
        liveStatus: 'finished',
        liveBaseWordRound: MAX_ROUNDS_PER_ROOM - 1,
      }),
    ).toBe('room_complete');
  });

  it('keeps rematch when live is already waiting/playing the final index (join, not bump)', () => {
    expect(
      resultsRematchFooterMode({
        displayBaseWordRound: MAX_ROUNDS_PER_ROOM - 2,
        liveStatus: 'waiting',
        liveBaseWordRound: MAX_ROUNDS_PER_ROOM - 1,
      }),
    ).toBe('rematch');
  });
});
