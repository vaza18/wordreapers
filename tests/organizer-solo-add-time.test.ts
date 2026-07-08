import { beforeEach, describe, expect, it } from 'vitest';

import type { LocalRoomSetup } from '../lib/online/local-room-draft.js';
import { useOrganizerSoloStore } from '../store/organizer-solo-store.js';

const setup: LocalRoomSetup = {
  baseWord: 'кабанюра',
  baseWordDisplay: 'КАБАНЮРА',
  durationMinutes: 10,
  uniqueBonusMode: 'off',
  allowProperNouns: false,
  allowSlang: false,
};

describe('organizer solo addTime', () => {
  beforeEach(() => {
    useOrganizerSoloStore.getState().clear();
    useOrganizerSoloStore.getState().initFromSetup('draft1', setup);
    useOrganizerSoloStore.getState().startRound();
  });

  it('extends the active timer', () => {
    const before = useOrganizerSoloStore.getState().endsAt;
    expect(before).not.toBeNull();
    useOrganizerSoloStore.getState().addTime(5);
    const after = useOrganizerSoloStore.getState().endsAt;
    expect(after).toBe((before ?? 0) + 5 * 60_000);
  });

  it('extends from now when the active timer already elapsed', () => {
    const pastEndsAt = Date.now() - 30_000;
    useOrganizerSoloStore.setState({ endsAt: pastEndsAt, status: 'playing' });
    const before = Date.now();
    useOrganizerSoloStore.getState().addTime(1);
    const after = useOrganizerSoloStore.getState().endsAt;
    expect(after).not.toBeNull();
    expect(after!).toBeGreaterThanOrEqual(before + 60_000 - 50);
    expect(after!).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(useOrganizerSoloStore.getState().status).toBe('playing');
  });

  it('extends frozen remaining time while paused', () => {
    useOrganizerSoloStore.getState().pauseRound();
    const before = useOrganizerSoloStore.getState().pausedRemainingMs;
    useOrganizerSoloStore.getState().addTime(3);
    const after = useOrganizerSoloStore.getState().pausedRemainingMs;
    expect(after).toBe((before ?? 0) + 3 * 60_000);
  });

  it('freezes remaining countdown when finishing early', () => {
    const endsAt = useOrganizerSoloStore.getState().endsAt;
    expect(endsAt).not.toBeNull();
    const remainingBeforeFinish = (endsAt ?? 0) - Date.now();
    useOrganizerSoloStore.getState().finishRound();
    const state = useOrganizerSoloStore.getState();
    expect(state.status).toBe('finished');
    expect(state.endsAt).toBeNull();
    expect(state.finishedAt).not.toBeNull();
    expect(state.finishedRemainingMs).toBeGreaterThan(remainingBeforeFinish - 500);
    expect(state.finishedRemainingMs).toBeLessThanOrEqual(remainingBeforeFinish);
    expect(state.getRemainingMs(Date.now())).toBe(state.finishedRemainingMs);
  });
});
