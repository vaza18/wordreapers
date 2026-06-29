import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
  onDisconnect: () => ({
    set: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }),
  onValue: vi.fn(),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'joiner' }),
  getFirebaseUid: vi.fn().mockResolvedValue('joiner'),
}));

vi.mock('../lib/firebase/rtdb-errors.js', () => ({
  isFirebasePermissionDenied: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'permission-denied',
  isFirebaseIgnorableRtdbError: vi.fn().mockReturnValue(false),
}));

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  fetchSessionWordMaps: vi.fn().mockResolvedValue({ wordPlayers: {} }),
}));

vi.mock('../lib/firebase/public-lobby-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase/public-lobby-service.js')>();
  return {
    ...actual,
    syncPublicLobbyPlayerCount: vi.fn().mockResolvedValue(undefined),
    syncPublicRosterAliases: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../lib/firebase/player-words-service.js', () => ({
  clearWaitingLobbyPlayerWordsAsOrganizer: vi.fn().mockResolvedValue(undefined),
  clearAllPlayerWords: vi.fn(),
}));

import { joinGameSession } from '../lib/firebase/game-session-service.js';

function playingSession(): GameSession {
  return {
    baseWord: 'портрет',
    status: 'playing',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      uniqueBonusMode: 'off',
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
  };
}

describe('joinGameSession blind invite join', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('uses blind join when playing session read is denied', async () => {
    getMock.mockRejectedValueOnce({ code: 'permission-denied' });

    const joined = {
      ...playingSession(),
      players: {
        ...playingSession().players,
        joiner: { name: 'New', wordCount: 0, score: 0, online: true, avatarColorIndex: 1 },
      },
      baseWordPickerOrder: ['org', 'joiner'],
    };

    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          ...playingSession(),
          players: joined.players,
        }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => joined,
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => joined,
      });

    const result = await joinGameSession('ABCDE', {
      name: 'New',
      gender: 'm',
      avatarColorIndex: 1,
    });

    expect(updateMock).toHaveBeenCalled();
    expect(result.players.joiner).toBeDefined();
  });

  it('completes blind join when session read is denied and words are in play', async () => {
    getMock.mockRejectedValueOnce({ code: 'permission-denied' });

    const sessionWithWords = {
      ...playingSession(),
      settings: {
        ...playingSession().settings,
        uniqueBonusMode: 'auto' as const,
        uniqueBonusEnabled: false,
      },
      players: {
        ...playingSession().players,
        p2: { name: 'Two', wordCount: 1, score: 5, online: true },
      },
    };

    const joined = {
      ...sessionWithWords,
      players: {
        ...sessionWithWords.players,
        joiner: { name: 'New', wordCount: 0, score: 0, online: true, avatarColorIndex: 1 },
      },
      baseWordPickerOrder: ['org', 'joiner'],
    };

    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => sessionWithWords,
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => joined,
      })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => joined,
      });

    const { fetchSessionWordMaps } = await import('../lib/firebase/session-word-maps-service.js');
    vi.mocked(fetchSessionWordMaps).mockResolvedValueOnce({
      wordPlayers: { slovo: { org: true } },
      wordFirst: { slovo: 'org' },
    });

    const result = await joinGameSession('ABCDE', {
      name: 'New',
      gender: 'm',
      avatarColorIndex: 1,
    });

    const sessionUpdate = updateMock.mock.calls.find(
      ([, payload]) => payload && typeof payload === 'object' && 'baseWordPickerOrder' in payload,
    );
    expect(sessionUpdate?.[1]).not.toHaveProperty('settings');
    expect(result.players.joiner).toBeDefined();
  });
});
