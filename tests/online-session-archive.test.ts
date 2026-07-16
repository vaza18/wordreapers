import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { storage } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return { storage };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      storage.delete(key);
      return Promise.resolve();
    },
  },
}));

vi.mock('../lib/online/playable-lexicon-archive.js', () => ({
  playableLexiconSnapshotForSession: () => ({
    maxCount: 2,
    words: ['рот', 'топ'],
    displays: ['РОТ', 'ТОП'],
  }),
}));

import type { GameSession } from '../lib/firebase/types.js';
import {
  archiveRouteKey,
  listFinishedRoundArchives,
  MAX_FINISHED_ARCHIVES,
  MAX_STORED_LEXICON_SNAPSHOTS,
  parseArchiveRouteKey,
  playingRoundSnapshotFromSession,
  saveFinishedRoundArchive,
} from '../lib/online/session/online-session-archive.js';

function session(
  status: GameSession['status'],
  timerEndsAt: number | null,
  roundStartedAt?: number,
): GameSession {
  return {
    baseWord: 'тест',
    status,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt,
    roundStartedAt,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
    baseWordRound: 0,
  };
}

describe('archive route keys', () => {
  it('round-trips game id and base word round', () => {
    expect(archiveRouteKey('2abc', 2)).toBe('2ABC--2');
    expect(parseArchiveRouteKey('2ABC--2')).toEqual({ gameId: '2ABC', baseWordRound: 2 });
  });

  it('rejects malformed keys', () => {
    expect(parseArchiveRouteKey('no-separator')).toBeNull();
    expect(parseArchiveRouteKey('abcd--nope')).toBeNull();
  });
});

describe('playingRoundSnapshotFromSession', () => {
  it('captures a playing snapshot while the timer runs', () => {
    const roundStartedAt = Date.now() - 60_000;
    const snap = playingRoundSnapshotFromSession(
      session('playing', Date.now() + 60_000, roundStartedAt),
    );
    expect(snap?.baseWord).toBe('тест');
    expect(snap?.roundStartedAt).toBe(roundStartedAt);
    expect(snap?.timerEndsAt).toBeGreaterThan(Date.now());
    expect(snap?.players.org?.name).toBe('Org');
    expect(snap?.organizerId).toBe('org');
  });

  it('returns null outside playing', () => {
    expect(playingRoundSnapshotFromSession(session('finished', null))).toBeNull();
    expect(playingRoundSnapshotFromSession(session('playing', null))).toBeNull();
  });
});

function finishedSession(gameIdSuffix: string): GameSession {
  return {
    ...session('finished', null),
    baseWord: `тест${gameIdSuffix}`,
  };
}

const ROOM_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function roomCodeForIndex(index: number): string {
  let n = index;
  let code = '';
  for (let digit = 0; digit < 4; digit++) {
    code = (ROOM_CODE_CHARS[n % ROOM_CODE_CHARS.length] ?? '2') + code;
    n = Math.floor(n / ROOM_CODE_CHARS.length);
  }
  return code;
}

/** Must match `FINISHED_ARCHIVES_KEY` in online-session-archive.ts. */
const FINISHED_ARCHIVES_STORAGE_KEY = 'wordreapers.finishedOnlineRounds';

/** Seed many archives in one write — avoids O(n²) JSON via repeated saveFinishedRoundArchive. */
function seedFinishedArchives(count: number, startIndex = 0): void {
  const store: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    const index = startIndex + i;
    const gameId = roomCodeForIndex(index);
    store[`${gameId}:0`] = {
      gameId,
      baseWordRound: 0,
      savedAt: index * 1000,
      session: finishedSession(String(index)),
      playerWords: {},
      archiveVersion: 3,
      ackSent: false,
      playerWordCounts: { org: 0 },
    };
  }
  storage.set(FINISHED_ARCHIVES_STORAGE_KEY, JSON.stringify(store));
}

describe('finished archive retention', () => {
  beforeEach(() => {
    storage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the newest finished archives up to MAX_FINISHED_ARCHIVES', async () => {
    seedFinishedArchives(MAX_FINISHED_ARCHIVES);
    const overflow = 5;
    for (let i = 0; i < overflow; i++) {
      const index = MAX_FINISHED_ARCHIVES + i;
      vi.setSystemTime(index * 1000);
      await saveFinishedRoundArchive(
        roomCodeForIndex(index),
        finishedSession(String(index)),
        new Map(),
      );
    }

    const archives = await listFinishedRoundArchives();
    expect(archives).toHaveLength(MAX_FINISHED_ARCHIVES);
    expect(archives.some((archive) => archive.gameId === roomCodeForIndex(0))).toBe(false);
    expect(archives[0]?.gameId).toBe(roomCodeForIndex(MAX_FINISHED_ARCHIVES + overflow - 1));
  });

  it('keeps playableLexicon only on the newest MAX_STORED_LEXICON_SNAPSHOTS archives', async () => {
    for (let i = 0; i < MAX_STORED_LEXICON_SNAPSHOTS + 3; i++) {
      vi.setSystemTime(i * 1000);
      await saveFinishedRoundArchive(roomCodeForIndex(i), finishedSession(String(i)), new Map());
    }

    const archives = await listFinishedRoundArchives();
    const withLexicon = archives.filter((archive) => archive.playableLexicon != null);
    expect(withLexicon).toHaveLength(MAX_STORED_LEXICON_SNAPSHOTS);
    expect(
      archives.find((archive) => archive.gameId === roomCodeForIndex(0))?.playableLexicon,
    ).toBeUndefined();
    expect(
      archives.find(
        (archive) => archive.gameId === roomCodeForIndex(MAX_STORED_LEXICON_SNAPSHOTS + 2),
      )?.playableLexicon,
    ).toBeDefined();
  });
});
