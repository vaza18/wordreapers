import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SoloRoundSnapshotV1 } from '../lib/game/solo-round-snapshot.js';
import type { PausedOnlineResumePointer } from '../lib/online/session/paused-online-resume.js';
import { resolveInterruptedRoundResume } from '../lib/app/resolve-interrupted-round-resume.js';
import { playingSession } from './helpers/game-session-fixtures.js';
import type { LocalRoomSetup } from '../lib/online/local-room-draft.js';

const setup: LocalRoomSetup = {
  baseWord: 'тестслово',
  baseWordDisplay: 'ТЕСТСЛОВО',
  durationMinutes: 5,
  uniqueBonusMode: 'off',
  allowProperNouns: false,
  allowSlang: false,
};

const soloSnap: SoloRoundSnapshotV1 = {
  version: 1,
  draftId: 'SOLO1',
  setup,
  uniqueBonusEnabled: false,
  status: 'paused',
  pausedRemainingMs: 30_000,
  roundTimerBudgetSeconds: 300,
  roundPlayedSeconds: null,
  words: [],
  published: false,
  savedAt: 1,
};

const pointer: PausedOnlineResumePointer = {
  gameId: 'ABCD',
  baseWordRound: 0,
  uid: 'org',
};

describe('resolveInterruptedRoundResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers solo snapshot over online pointer', async () => {
    const applySolo = vi.fn();
    const clearOnline = vi.fn();
    const target = await resolveInterruptedRoundResume({
      loadSolo: async () => soloSnap,
      applySolo,
      loadOnlinePointer: async () => pointer,
      fetchSession: async () => null,
      getUid: () => 'org',
      clearOnlinePointer: clearOnline,
    });

    expect(target).toEqual({ kind: 'solo', gameId: 'SOLO1' });
    expect(applySolo).toHaveBeenCalledWith(soloSnap);
    expect(clearOnline).not.toHaveBeenCalled();
  });

  it('resumes paused online when RTDB still paused', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      {
        timerEndsAt: null,
        pauseState: { active: true, frozenRemainingMs: 10_000, frozenAt: 1 },
      },
    );
    const target = await resolveInterruptedRoundResume({
      loadSolo: async () => null,
      applySolo: () => {},
      loadOnlinePointer: async () => pointer,
      fetchSession: async () => session,
      getUid: () => 'org',
      clearOnlinePointer: async () => {},
    });

    expect(target).toEqual({ kind: 'onlinePaused', gameId: 'ABCD' });
  });

  it('clears online pointer when session is no longer paused', async () => {
    const clearOnline = vi.fn();
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 9_999_999, pauseState: null },
    );
    const target = await resolveInterruptedRoundResume({
      loadSolo: async () => null,
      applySolo: () => {},
      loadOnlinePointer: async () => pointer,
      fetchSession: async () => session,
      getUid: () => 'org',
      clearOnlinePointer: clearOnline,
    });

    expect(target).toBeNull();
    expect(clearOnline).toHaveBeenCalled();
  });

  it('keeps online pointer when fetch fails (timeout / offline)', async () => {
    const clearOnline = vi.fn();
    const target = await resolveInterruptedRoundResume({
      loadSolo: async () => null,
      applySolo: () => {},
      loadOnlinePointer: async () => pointer,
      fetchSession: async () => {
        throw new Error('network');
      },
      getUid: () => 'org',
      clearOnlinePointer: clearOnline,
    });

    expect(target).toBeNull();
    expect(clearOnline).not.toHaveBeenCalled();
  });

  it('returns null when nothing to resume', async () => {
    const target = await resolveInterruptedRoundResume({
      loadSolo: async () => null,
      applySolo: () => {},
      loadOnlinePointer: async () => null,
      fetchSession: async () => null,
      getUid: () => null,
      clearOnlinePointer: async () => {},
    });
    expect(target).toBeNull();
  });
});
