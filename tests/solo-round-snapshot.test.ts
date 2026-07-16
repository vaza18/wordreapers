import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { resetAsyncStorageMock, getAsyncStorageMap } from './helpers/mock-async-storage.js';
import {
  SOLO_ROUND_SNAPSHOT_KEY,
  buildSoloRoundSnapshot,
  clearSoloRoundSnapshot,
  loadSoloRoundSnapshot,
  parseSoloRoundSnapshot,
  saveSoloRoundSnapshot,
} from '../lib/game/solo-round-snapshot.js';
import type { LocalRoomSetup } from '../lib/online/local-room-draft.js';

const setup: LocalRoomSetup = {
  baseWord: 'тестслово',
  baseWordDisplay: 'ТЕСТСЛОВО',
  durationMinutes: 5,
  uniqueBonusMode: 'off',
  allowProperNouns: false,
  allowSlang: false,
};

describe('solo-round-snapshot', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it('builds a paused snapshot from playing state using remaining ms', () => {
    const snap = buildSoloRoundSnapshot({
      draftId: 'ABCDE',
      setup,
      uniqueBonusEnabled: false,
      status: 'playing',
      endsAt: 1_000_000 + 90_000,
      pausedRemainingMs: null,
      roundTimerBudgetSeconds: 300,
      roundPlayedSeconds: null,
      words: [
        {
          normalized: 'тест',
          display: 'ТЕСТ',
          kind: 'normal',
          points: 1,
          badge: null,
          at: 1,
        },
      ],
      published: false,
      now: 1_000_000,
    });

    expect(snap).toMatchObject({
      version: 1,
      draftId: 'ABCDE',
      status: 'paused',
      pausedRemainingMs: 90_000,
      words: [expect.objectContaining({ normalized: 'тест' })],
    });
  });

  it('returns null when there is no active round to persist', () => {
    expect(
      buildSoloRoundSnapshot({
        draftId: 'ABCDE',
        setup,
        uniqueBonusEnabled: false,
        status: 'idle',
        endsAt: null,
        pausedRemainingMs: null,
        roundTimerBudgetSeconds: null,
        roundPlayedSeconds: null,
        words: [],
        published: false,
        now: 1,
      }),
    ).toBeNull();

    expect(
      buildSoloRoundSnapshot({
        draftId: 'ABCDE',
        setup: null,
        uniqueBonusEnabled: false,
        status: 'playing',
        endsAt: 2,
        pausedRemainingMs: null,
        roundTimerBudgetSeconds: 60,
        roundPlayedSeconds: null,
        words: [],
        published: false,
        now: 1,
      }),
    ).toBeNull();
  });

  it('round-trips through AsyncStorage', async () => {
    const snap = buildSoloRoundSnapshot({
      draftId: 'ABCDE',
      setup,
      uniqueBonusEnabled: false,
      status: 'paused',
      endsAt: null,
      pausedRemainingMs: 45_000,
      roundTimerBudgetSeconds: 300,
      roundPlayedSeconds: null,
      words: [],
      published: false,
      now: 1,
    });
    expect(snap).not.toBeNull();
    await saveSoloRoundSnapshot(snap!);

    const loaded = await loadSoloRoundSnapshot();
    expect(loaded?.pausedRemainingMs).toBe(45_000);
    expect(loaded?.setup.baseWord).toBe('тестслово');
  });

  it('round-trips playable lexicon through AsyncStorage', async () => {
    const playableLexicon = {
      maxCount: 2,
      words: ['тест', 'слово'],
      displays: ['ТЕСТ', 'СЛОВО'],
    };
    const snap = buildSoloRoundSnapshot({
      draftId: 'ABCDE',
      setup,
      uniqueBonusEnabled: false,
      status: 'paused',
      endsAt: null,
      pausedRemainingMs: 45_000,
      roundTimerBudgetSeconds: 300,
      roundPlayedSeconds: null,
      words: [],
      published: false,
      playableLexicon,
      now: 1,
    });
    expect(snap).not.toBeNull();
    await saveSoloRoundSnapshot(snap!);

    const loaded = await loadSoloRoundSnapshot();
    expect(loaded?.playableLexicon).toEqual(playableLexicon);
  });

  it('rejects corrupt storage and clears it', async () => {
    getAsyncStorageMap().set(SOLO_ROUND_SNAPSHOT_KEY, '{not-json');
    expect(await loadSoloRoundSnapshot()).toBeNull();
    expect(getAsyncStorageMap().has(SOLO_ROUND_SNAPSHOT_KEY)).toBe(false);
  });

  it('parseSoloRoundSnapshot rejects wrong version / missing setup', () => {
    expect(parseSoloRoundSnapshot({ version: 99 })).toBeNull();
    expect(parseSoloRoundSnapshot({ version: 1, draftId: 'X' })).toBeNull();
  });

  it('parseSoloRoundSnapshot rejects corrupt playableLexicon', () => {
    expect(
      parseSoloRoundSnapshot({
        version: 1,
        draftId: 'ABCDE',
        setup,
        uniqueBonusEnabled: false,
        status: 'paused',
        pausedRemainingMs: 1,
        roundTimerBudgetSeconds: 300,
        roundPlayedSeconds: null,
        words: [],
        published: false,
        playableLexicon: { maxCount: 1, words: ['a'], displays: [] },
        savedAt: 1,
      }),
    ).toBeNull();
  });

  it('clearSoloRoundSnapshot removes the key', async () => {
    getAsyncStorageMap().set(SOLO_ROUND_SNAPSHOT_KEY, '{}');
    await clearSoloRoundSnapshot();
    expect(getAsyncStorageMap().has(SOLO_ROUND_SNAPSHOT_KEY)).toBe(false);
  });
});
