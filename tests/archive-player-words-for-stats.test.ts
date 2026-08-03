import { describe, expect, it } from 'vitest';

import {
  shouldFinalizeStatsFromFinishedArchive,
  wordsByPlayerFromArchivedPlayerWords,
} from '../lib/online/session/archive-player-words-for-stats.js';

describe('wordsByPlayerFromArchivedPlayerWords', () => {
  it('keeps v4 string arrays', () => {
    const words = wordsByPlayerFromArchivedPlayerWords({
      org: ['порт', 'рот'],
      peer: ['вал'],
    });
    expect(words.get('org')).toEqual(['порт', 'рот']);
    expect(words.get('peer')).toEqual(['вал']);
  });

  it('extracts normalized keys from legacy {display,at} leaves', () => {
    const words = wordsByPlayerFromArchivedPlayerWords({
      org: { порт: { display: 'ПОРТ', at: 1 }, рот: { display: 'РОТ', at: 2 } },
      peer: { вал: { display: 'ВАЛ', at: 3 } },
    });
    expect(words.get('org')).toEqual(['порт', 'рот']);
    expect(words.get('peer')).toEqual(['вал']);
  });
});

describe('shouldFinalizeStatsFromFinishedArchive', () => {
  it('allows finalize when archive words were extracted', () => {
    expect(
      shouldFinalizeStatsFromFinishedArchive({
        isLegacy: true,
        wordsByPlayer: new Map([['org', ['порт']]]),
        playerWordCounts: { org: 1 },
      }),
    ).toBe(true);
  });

  it('blocks legacy empty extract when counts claim words (no zero stats)', () => {
    expect(
      shouldFinalizeStatsFromFinishedArchive({
        isLegacy: true,
        wordsByPlayer: new Map(),
        playerWordCounts: { org: 3, peer: 1 },
      }),
    ).toBe(false);
  });

  it('allows true empty legacy when counts claim nothing', () => {
    expect(
      shouldFinalizeStatsFromFinishedArchive({
        isLegacy: true,
        wordsByPlayer: new Map(),
        playerWordCounts: { org: 0 },
      }),
    ).toBe(true);
  });

  it('allows v4 empty (authoritative zero-word round)', () => {
    expect(
      shouldFinalizeStatsFromFinishedArchive({
        isLegacy: false,
        wordsByPlayer: new Map(),
        playerWordCounts: { org: 0 },
      }),
    ).toBe(true);
  });
});
