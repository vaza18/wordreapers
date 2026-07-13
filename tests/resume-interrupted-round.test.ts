import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SoloRoundSnapshotV1 } from '../lib/game/solo-round-snapshot.js';
import type { LeftOnlineResumePointer } from '../lib/online/session/left-online-resume.js';
import type { PausedOnlineResumePointer } from '../lib/online/session/paused-online-resume.js';
import {
  resolveInterruptedRoundResume,
  resumeTargetHref,
} from '../lib/app/resolve-interrupted-round-resume.js';
import { finishedSession, playingSession } from './helpers/game-session-fixtures.js';
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

const pausedPointer: PausedOnlineResumePointer = {
  gameId: 'ABCD',
  baseWordRound: 0,
  uid: 'org',
};

const leftPointer: LeftOnlineResumePointer = {
  gameId: 'LEFT1',
  baseWordRound: 0,
  uid: 'org',
};

function baseDeps(overrides: Partial<Parameters<typeof resolveInterruptedRoundResume>[0]> = {}) {
  return {
    loadSolo: async () => null,
    applySolo: () => {},
    loadPausedPointer: async () => null,
    clearPausedPointer: async () => {},
    loadLeftPointer: async () => null,
    clearLeftPointer: async () => {},
    fetchSession: async () => null,
    getUid: () => 'org' as string | null,
    ...overrides,
  };
}

describe('resolveInterruptedRoundResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers solo snapshot over online pointers', async () => {
    const applySolo = vi.fn();
    const clearPaused = vi.fn();
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadSolo: async () => soloSnap,
        applySolo,
        loadPausedPointer: async () => pausedPointer,
        loadLeftPointer: async () => leftPointer,
        clearPausedPointer: clearPaused,
      }),
    );

    expect(target).toEqual({ kind: 'solo', gameId: 'SOLO1' });
    expect(applySolo).toHaveBeenCalledWith(soloSnap);
    expect(clearPaused).not.toHaveBeenCalled();
  });

  it('prefers paused online over left pointer', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      {
        timerEndsAt: null,
        pauseState: { active: true, frozenRemainingMs: 10_000, frozenAt: 1 },
      },
    );
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadPausedPointer: async () => pausedPointer,
        loadLeftPointer: async () => leftPointer,
        fetchSession: async (gameId) => (gameId === 'ABCD' ? session : null),
      }),
    );

    expect(target).toEqual({ kind: 'onlinePaused', gameId: 'ABCD' });
  });

  it('resumes left screen when room still exists (even if finished)', async () => {
    const finished = {
      ...finishedSession(),
      players: { org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true } },
    };
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadLeftPointer: async () => leftPointer,
        fetchSession: async () => finished,
      }),
    );

    expect(target).toEqual({ kind: 'onlineLeft', gameId: 'LEFT1' });
    expect(resumeTargetHref(target!)).toEqual({
      pathname: '/online/left/[gameId]',
      params: { gameId: 'LEFT1' },
    });
  });

  it('clears paused pointer when session is no longer paused, then tries left', async () => {
    const clearPaused = vi.fn();
    const playing = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true } },
      { timerEndsAt: 9_999_999, pauseState: null },
    );
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadPausedPointer: async () => pausedPointer,
        clearPausedPointer: clearPaused,
        loadLeftPointer: async () => leftPointer,
        fetchSession: async (gameId) => (gameId === 'LEFT1' || gameId === 'ABCD' ? playing : null),
      }),
    );

    expect(clearPaused).toHaveBeenCalled();
    expect(target).toEqual({ kind: 'onlineLeft', gameId: 'LEFT1' });
  });

  it('clears left pointer when room is gone', async () => {
    const clearLeft = vi.fn();
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadLeftPointer: async () => leftPointer,
        clearLeftPointer: clearLeft,
        fetchSession: async () => null,
      }),
    );

    expect(target).toBeNull();
    expect(clearLeft).toHaveBeenCalled();
  });

  it('keeps pointers when fetch fails (timeout / offline)', async () => {
    const clearPaused = vi.fn();
    const target = await resolveInterruptedRoundResume(
      baseDeps({
        loadPausedPointer: async () => pausedPointer,
        clearPausedPointer: clearPaused,
        fetchSession: async () => {
          throw new Error('network');
        },
      }),
    );

    expect(target).toBeNull();
    expect(clearPaused).not.toHaveBeenCalled();
  });

  it('returns null when nothing to resume', async () => {
    const target = await resolveInterruptedRoundResume(baseDeps());
    expect(target).toBeNull();
  });
});
