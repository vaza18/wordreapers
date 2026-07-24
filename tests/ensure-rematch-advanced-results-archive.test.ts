import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFinishedRoundArchive = vi.fn();
const saveFinishedRoundArchive = vi.fn();

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
  saveFinishedRoundArchive: (...args: unknown[]) => saveFinishedRoundArchive(...args),
}));

import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';
import type { GameSession } from '../lib/firebase/types.js';
import {
  buildPartialArchiveWordsForLocalTimeUp,
  ensureLocalArchiveForRematchAdvancedResults,
  resolveLocalFinishedSessionForResultsArchive,
} from '../lib/online/ensure-rematch-advanced-results-archive.js';

function word(display: string): StoredPlayerWord {
  return { display, at: 1 };
}

describe('buildPartialArchiveWordsForLocalTimeUp', () => {
  it('keeps viewer words and empty maps for peers', () => {
    const myWords = new Map([['слово', word('слово')]]);
    const words = buildPartialArchiveWordsForLocalTimeUp(['me', 'peer'], 'me', myWords);
    expect(words.get('me')?.size).toBe(1);
    expect(words.get('peer')?.size).toBe(0);
  });
});

describe('ensureLocalArchiveForRematchAdvancedResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when archive already exists without rewriting', async () => {
    getFinishedRoundArchive.mockResolvedValue({ baseWordRound: 1 });
    await expect(
      ensureLocalArchiveForRematchAdvancedResults({
        gameId: 'ABCDE',
        expectedBaseWordRound: 1,
        localFinishedSession: null,
        myUid: 'me',
        myWords: new Map(),
      }),
    ).resolves.toBe(true);
    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('seeds from local synthetic finished when archive missing', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    const local = {
      status: 'finished',
      baseWordRound: 1,
      players: { me: { name: 'Me', wordCount: 1, score: 1, online: false } },
    } as unknown as GameSession;

    await expect(
      ensureLocalArchiveForRematchAdvancedResults({
        gameId: 'ABCDE',
        expectedBaseWordRound: 1,
        localFinishedSession: local,
        myUid: 'me',
        myWords: new Map([['слово', word('слово')]]),
      }),
    ).resolves.toBe(true);
    expect(saveFinishedRoundArchive).toHaveBeenCalledOnce();
  });

  it('returns false when rematch advanced and no local finished snapshot', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    await expect(
      ensureLocalArchiveForRematchAdvancedResults({
        gameId: 'ABCDE',
        expectedBaseWordRound: 1,
        localFinishedSession: null,
        myUid: 'me',
        myWords: new Map(),
      }),
    ).resolves.toBe(false);
    expect(saveFinishedRoundArchive).not.toHaveBeenCalled();
  });

  it('coerces still-playing local snapshot into finished archive seed', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);
    saveFinishedRoundArchive.mockResolvedValue(undefined);
    await expect(
      ensureLocalArchiveForRematchAdvancedResults({
        gameId: 'ABCDE',
        expectedBaseWordRound: 1,
        localFinishedSession: {
          status: 'playing',
          baseWordRound: 1,
          players: { me: { name: 'Me', wordCount: 1, score: 1, online: false } },
        } as unknown as GameSession,
        myUid: 'me',
        myWords: new Map([['слово', word('слово')]]),
      }),
    ).resolves.toBe(true);
    expect(saveFinishedRoundArchive).toHaveBeenCalledOnce();
    expect(saveFinishedRoundArchive.mock.calls[0]?.[1]).toMatchObject({
      status: 'finished',
      baseWordRound: 1,
    });
  });
});

describe('resolveLocalFinishedSessionForResultsArchive', () => {
  it('builds finished seed from live playing when pin missing', () => {
    const live = {
      status: 'playing',
      baseWordRound: 2,
      players: { me: { name: 'Me', wordCount: 0, score: 0, online: true } },
    } as unknown as GameSession;
    const resolved = resolveLocalFinishedSessionForResultsArchive({
      gameId: 'ABCDE',
      expectedBaseWordRound: 1,
      localFinishedSession: null,
      liveSession: live,
    });
    expect(resolved).toMatchObject({
      id: 'ABCDE',
      status: 'finished',
      baseWordRound: 1,
    });
  });
});
