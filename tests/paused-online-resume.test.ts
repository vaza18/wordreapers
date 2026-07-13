import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { getAsyncStorageMap, resetAsyncStorageMock } from './helpers/mock-async-storage.js';
import { playingSession } from './helpers/game-session-fixtures.js';
import {
  PAUSED_ONLINE_RESUME_KEY,
  clearPausedOnlineResume,
  loadPausedOnlineResume,
  parsePausedOnlineResume,
  savePausedOnlineResume,
  shouldResumePausedOnline,
} from '../lib/online/session/paused-online-resume.js';

describe('paused-online-resume', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it('round-trips a resume pointer', async () => {
    await savePausedOnlineResume({ gameId: 'ABCD', baseWordRound: 1, uid: 'u1' });
    expect(await loadPausedOnlineResume()).toEqual({
      gameId: 'ABCD',
      baseWordRound: 1,
      uid: 'u1',
    });
  });

  it('rejects corrupt storage', async () => {
    getAsyncStorageMap().set(PAUSED_ONLINE_RESUME_KEY, 'nope');
    expect(await loadPausedOnlineResume()).toBeNull();
    expect(getAsyncStorageMap().has(PAUSED_ONLINE_RESUME_KEY)).toBe(false);
  });

  it('shouldResumePausedOnline only when playing + pause active + matching round/uid', () => {
    const pointer = { gameId: 'ABCD', baseWordRound: 0, uid: 'org' };
    const paused = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      {
        timerEndsAt: null,
        pauseState: { active: true, frozenRemainingMs: 60_000, frozenAt: 1 },
      },
    );

    expect(shouldResumePausedOnline(pointer, paused, 'org')).toBe(true);
    expect(shouldResumePausedOnline(pointer, paused, 'other')).toBe(false);
    expect(shouldResumePausedOnline(pointer, { ...paused, pauseState: null }, 'org')).toBe(false);
    expect(shouldResumePausedOnline(pointer, { ...paused, status: 'finished' }, 'org')).toBe(false);
    expect(shouldResumePausedOnline({ ...pointer, baseWordRound: 2 }, paused, 'org')).toBe(false);
    expect(shouldResumePausedOnline(pointer, null, 'org')).toBe(false);
  });

  it('parsePausedOnlineResume validates fields', () => {
    expect(parsePausedOnlineResume({ gameId: 'A', baseWordRound: 0, uid: 'u' })).toEqual({
      gameId: 'A',
      baseWordRound: 0,
      uid: 'u',
    });
    expect(parsePausedOnlineResume({ gameId: '', baseWordRound: 0, uid: 'u' })).toBeNull();
    expect(parsePausedOnlineResume(null)).toBeNull();
  });

  it('clearPausedOnlineResume removes the key', async () => {
    await savePausedOnlineResume({ gameId: 'ABCD', baseWordRound: 0, uid: 'u1' });
    await clearPausedOnlineResume();
    expect(getAsyncStorageMap().has(PAUSED_ONLINE_RESUME_KEY)).toBe(false);
  });
});
