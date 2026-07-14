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

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  fetchSessionWordMaps: vi.fn().mockResolvedValue({ wordPlayers: {} }),
}));

vi.mock('../lib/firebase/public-lobby-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/firebase/public-lobby-service.js')>();
  return {
    ...actual,
    syncPublicLobbyPlayerCount: vi.fn().mockResolvedValue(undefined),
    syncPublicRosterAliases: vi.fn().mockResolvedValue(undefined),
    unpublishPublicLobby: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../lib/firebase/player-words-service.js', () => ({
  clearWaitingLobbyPlayerWordsAsOrganizer: vi.fn().mockResolvedValue(undefined),
  clearAllPlayerWords: vi.fn(),
}));

import { joinGameSession } from '../lib/firebase/game-session-service.js';

function player(name: string) {
  return { name, wordCount: 0, score: 0, avatarColorIndex: 0, online: true };
}

function publicSession(playerCount: number, language = 'uk-uk'): GameSession {
  const players: GameSession['players'] = {
    org: player('Org'),
  };
  for (let index = 1; index < playerCount; index += 1) {
    players[`p${index}`] = {
      ...player(`P${index}`),
      publicAlias: `Гравець ${index}`,
    };
  }
  return {
    baseWord: 'портрет',
    status: 'waiting',
    isPublic: true,
    maxPlayers: 8,
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language,
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
  };
}

function snapshot(session: GameSession) {
  return {
    exists: () => true,
    val: () => session,
  };
}

describe('joinGameSession public rooms', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('rejects browse join when language mismatches', async () => {
    getMock.mockResolvedValueOnce(snapshot(publicSession(2, 'uk-uk')));
    await expect(
      joinGameSession(
        'ABCDE',
        { name: 'New', gender: 'm', avatarColorIndex: 1 },
        { joinSource: 'browse', playerLanguage: 'en-gb' },
      ),
    ).rejects.toThrow('LANGUAGE_MISMATCH');
  });

  it('rejects join when room is full', async () => {
    const full = publicSession(8);
    getMock.mockResolvedValueOnce(snapshot(full)).mockResolvedValueOnce(snapshot(full));
    await expect(
      joinGameSession('ABCDE', { name: 'New', gender: 'm', avatarColorIndex: 1 }),
    ).rejects.toThrow('ROOM_FULL');
  });

  it('assigns next public alias on join', async () => {
    const session = publicSession(2);
    session.players.p1 = { ...session.players.p1!, publicAlias: 'Гравець 1' };
    const joined = {
      ...session,
      players: {
        ...session.players,
        joiner: {
          ...player('New'),
          publicAlias: 'Гравець 2',
        },
      },
    };
    getMock
      .mockResolvedValueOnce(snapshot(session))
      .mockResolvedValueOnce(snapshot({ ...session, players: joined.players }))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined));

    const result = await joinGameSession(
      'ABCDE',
      { name: 'New', gender: 'm', avatarColorIndex: 1 },
      { joinSource: 'browse', playerLanguage: 'uk-uk' },
    );

    expect(updateMock).toHaveBeenCalled();
    const playerUpdate = updateMock.mock.calls[0]?.[1] as Record<string, { publicAlias?: string }>;
    expect(playerUpdate.joiner?.publicAlias).toBe('Гравець 2');
    expect(result.players.joiner?.publicAlias).toBe('Гравець 2');
  });

  it('sets joinedVia browse and identityMasked on browse join', async () => {
    const session = publicSession(2);
    const joined = {
      ...session,
      identityMasked: true,
      players: {
        ...session.players,
        joiner: {
          ...player('New'),
          publicAlias: 'Гравець 2',
          joinedVia: 'browse' as const,
        },
      },
    };
    getMock
      .mockResolvedValueOnce(snapshot(session))
      .mockResolvedValueOnce(snapshot({ ...session, players: joined.players }))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined));

    await joinGameSession(
      'ABCDE',
      { name: 'New', gender: 'm', avatarColorIndex: 1 },
      { joinSource: 'browse', playerLanguage: 'uk-uk' },
    );

    const playerUpdate = updateMock.mock.calls[0]?.[1] as Record<
      string,
      { publicAlias?: string; joinedVia?: string; gender?: string }
    >;
    expect(playerUpdate.joiner?.joinedVia).toBe('browse');
    expect(playerUpdate.joiner?.gender).toBeUndefined();
    const sessionPatch = updateMock.mock.calls.find(([, patch]) =>
      Boolean((patch as { identityMasked?: boolean }).identityMasked),
    )?.[1] as { identityMasked?: boolean };
    expect(sessionPatch?.identityMasked).toBe(true);
  });

  it('does not enforce language match for code join', async () => {
    const session = publicSession(2);
    const joined = {
      ...session,
      players: {
        ...session.players,
        joiner: { ...player('New'), publicAlias: 'Гравець 2' },
      },
    };
    getMock
      .mockResolvedValueOnce(snapshot(session))
      .mockResolvedValueOnce(snapshot({ ...session, players: joined.players }))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined))
      .mockResolvedValueOnce(snapshot(joined));

    await expect(
      joinGameSession('ABCDE', { name: 'New', gender: 'm', avatarColorIndex: 1 }),
    ).resolves.toBeDefined();
  });
});
