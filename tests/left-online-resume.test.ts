import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { getAsyncStorageMap, resetAsyncStorageMock } from './helpers/mock-async-storage.js';
import { finishedSession, playingSession } from './helpers/game-session-fixtures.js';
import {
  LEFT_ONLINE_RESUME_KEY,
  clearLeftOnlineResume,
  loadLeftOnlineResume,
  parseLeftOnlineResume,
  saveLeftOnlineResume,
  shouldResumeLeftOnline,
} from '../lib/online/session/left-online-resume.js';

describe('left-online-resume', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it('round-trips a resume pointer', async () => {
    await saveLeftOnlineResume({ gameId: 'ABCDE', baseWordRound: 1, uid: 'u1' });
    expect(await loadLeftOnlineResume()).toEqual({
      gameId: 'ABCDE',
      baseWordRound: 1,
      uid: 'u1',
    });
  });

  it('rejects corrupt storage', async () => {
    getAsyncStorageMap().set(LEFT_ONLINE_RESUME_KEY, 'nope');
    expect(await loadLeftOnlineResume()).toBeNull();
    expect(getAsyncStorageMap().has(LEFT_ONLINE_RESUME_KEY)).toBe(false);
  });

  it('shouldResumeLeftOnline when room and player still exist (playing or finished)', () => {
    const pointer = { gameId: 'ABCDE', baseWordRound: 0, uid: 'org' };
    const playing = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
    });
    const finished = {
      ...finishedSession(),
      players: { org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true } },
    };

    expect(shouldResumeLeftOnline(pointer, playing, 'org')).toBe(true);
    expect(shouldResumeLeftOnline(pointer, finished, 'org')).toBe(true);
    expect(shouldResumeLeftOnline(pointer, playing, 'other')).toBe(false);
    expect(shouldResumeLeftOnline(pointer, null, 'org')).toBe(false);
    expect(
      shouldResumeLeftOnline(
        pointer,
        playingSession({ a: { name: 'A', wordCount: 0, score: 0 } }),
        'org',
      ),
    ).toBe(false);
  });

  it('parseLeftOnlineResume validates fields', () => {
    expect(parseLeftOnlineResume({ gameId: 'A', baseWordRound: 0, uid: 'u' })).toEqual({
      gameId: 'A',
      baseWordRound: 0,
      uid: 'u',
    });
    expect(parseLeftOnlineResume({ gameId: '', baseWordRound: 0, uid: 'u' })).toBeNull();
  });

  it('clearLeftOnlineResume removes the key', async () => {
    await saveLeftOnlineResume({ gameId: 'ABCDE', baseWordRound: 0, uid: 'u1' });
    await clearLeftOnlineResume();
    expect(getAsyncStorageMap().has(LEFT_ONLINE_RESUME_KEY)).toBe(false);
  });
});
