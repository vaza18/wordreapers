import { describe, expect, it } from 'vitest';

import {
  isOppositePresenceToast,
  resolvePendingPresenceToast,
} from '../lib/online/presence-toast-coalesce.js';
import { applyToastWallClock } from '../lib/online/play-toast-wall-clock.js';

describe('resolvePendingPresenceToast', () => {
  const offline = {
    type: 'player_went_offline' as const,
    playerId: 'a',
    name: 'A',
    gender: 'm' as const,
  };
  const returned = {
    type: 'player_returned' as const,
    playerId: 'a',
    name: 'A',
    gender: 'm' as const,
  };

  it('cancels offline then returned for the same player', () => {
    expect(resolvePendingPresenceToast(offline, returned)).toEqual({
      pending: null,
      emit: null,
      cancel: true,
    });
  });

  it('cancels returned then offline for the same player', () => {
    expect(resolvePendingPresenceToast(returned, offline)).toEqual({
      pending: null,
      emit: null,
      cancel: true,
    });
  });

  it('keeps the latest event when the direction repeats', () => {
    const later = { ...returned, name: 'A2' };
    expect(resolvePendingPresenceToast(returned, later)).toEqual({
      pending: later,
      emit: null,
      cancel: false,
    });
  });

  it('starts a new pending when there was none', () => {
    expect(resolvePendingPresenceToast(null, offline)).toEqual({
      pending: offline,
      emit: null,
      cancel: false,
    });
  });

  it('detects opposite presence types', () => {
    expect(isOppositePresenceToast('player_went_offline', 'player_returned')).toBe(true);
    expect(isOppositePresenceToast('player_returned', 'player_returned')).toBe(false);
  });
});

describe('applyToastWallClock', () => {
  const base = (overrides: Partial<Parameters<typeof applyToastWallClock>[0][number]>) => ({
    id: '1',
    message: 'hi',
    variant: 'default' as const,
    fading: false,
    expiresAt: 10_000,
    ...overrides,
  });

  it('drops toasts past expiresAt', () => {
    expect(applyToastWallClock([base({ expiresAt: 5_000 })], 5_000)).toEqual([]);
    expect(applyToastWallClock([base({ expiresAt: 5_000 })], 5_001)).toEqual([]);
  });

  it('marks fading when within the fade window', () => {
    const toast = base({ expiresAt: 10_000, fading: false });
    expect(applyToastWallClock([toast], 9_700)).toEqual([{ ...toast, fading: true }]);
  });

  it('keeps non-expired toasts unchanged outside the fade window', () => {
    const toast = base({ expiresAt: 10_000 });
    expect(applyToastWallClock([toast], 5_000)).toEqual([toast]);
  });
});
