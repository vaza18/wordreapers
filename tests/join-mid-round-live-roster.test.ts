import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolvePostJoinRoute } from '../lib/online/post-join-route.js';

const getMock = vi.fn();
const updateMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: vi.fn().mockResolvedValue(undefined),
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
  isFirebasePermissionDenied: () => false,
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

function roundTwoPlayingSession(): GameSession {
  return {
    baseWord: 'портрет',
    status: 'playing',
    baseWordRound: 1,
    liveRoundPlayerUids: ['org', 'p2'],
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
    baseWordPickerOrder: ['org', 'p2'],
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 1, score: 1, online: true },
    },
  };
}

describe('joinGameSession mid-round live roster', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    updateMock.mockResolvedValue(undefined);
  });

  it('appends joiner to liveRoundPlayerUids when joining round 2+', async () => {
    const playing = roundTwoPlayingSession();
    const joined = {
      ...playing,
      players: {
        ...playing.players,
        joiner: { name: 'New', wordCount: 0, score: 0, online: true, avatarColorIndex: 1 },
      },
      baseWordPickerOrder: ['org', 'p2', 'joiner'],
      liveRoundPlayerUids: ['org', 'p2', 'joiner'],
    };

    getMock
      .mockResolvedValueOnce({ exists: () => true, val: () => playing })
      .mockResolvedValueOnce({ exists: () => true, val: () => playing })
      .mockResolvedValueOnce({ exists: () => true, val: () => playing })
      .mockResolvedValueOnce({ exists: () => true, val: () => joined });

    const result = await joinGameSession('ABCDE', {
      name: 'New',
      gender: 'm',
      avatarColorIndex: 1,
    });

    const sessionUpdate = updateMock.mock.calls.find(
      ([, payload]) =>
        payload &&
        typeof payload === 'object' &&
        'liveRoundPlayerUids' in payload &&
        Array.isArray((payload as { liveRoundPlayerUids: string[] }).liveRoundPlayerUids),
    );
    expect(sessionUpdate?.[1]).toMatchObject({
      liveRoundPlayerUids: ['org', 'p2', 'joiner'],
    });
    expect(result.liveRoundPlayerUids).toEqual(['org', 'p2', 'joiner']);
    expect(resolvePostJoinRoute(result, 'joiner', 'ABCDE')).toEqual({
      pathname: '/online/play/[gameId]',
      params: { gameId: 'ABCDE' },
    });
  });
});
