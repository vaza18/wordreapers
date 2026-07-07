import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { getAsyncStorageMap, resetAsyncStorageMock } from './helpers/mock-async-storage.js';
import {
  markOnlineRoundProcessed,
  onlineRoundKey,
  wasOnlineRoundProcessed,
} from '../lib/online/session/processed-online-rounds.js';

const STORAGE_KEY = 'wordreapers.processedOnlineRounds';

describe('processed-online-rounds', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it('normalizes room code in round keys', () => {
    expect(onlineRoundKey('abcd', 2)).toBe('ABCD:2');
  });

  it('reports unprocessed rounds by default', async () => {
    expect(await wasOnlineRoundProcessed('ABCD:0')).toBe(false);
  });

  it('marks a round as processed', async () => {
    await markOnlineRoundProcessed('ABCD:0');

    expect(await wasOnlineRoundProcessed('ABCD:0')).toBe(true);
    expect(await wasOnlineRoundProcessed('ABCD:1')).toBe(false);
  });

  it('is idempotent when marking the same round twice', async () => {
    await markOnlineRoundProcessed('ABCD:0');
    await markOnlineRoundProcessed('ABCD:0');

    const raw = getAsyncStorageMap().get(STORAGE_KEY);
    expect(JSON.parse(String(raw))).toEqual(['ABCD:0']);
  });

  it('treats corrupt storage as empty', async () => {
    getAsyncStorageMap().set(STORAGE_KEY, 'not-json');

    expect(await wasOnlineRoundProcessed('ABCD:0')).toBe(false);
  });

  it('treats non-array storage as empty', async () => {
    getAsyncStorageMap().set(STORAGE_KEY, JSON.stringify({ bad: true }));

    expect(await wasOnlineRoundProcessed('ABCD:0')).toBe(false);
  });

  it('trims stored keys to the last 200 entries', async () => {
    for (let i = 0; i < 205; i++) {
      await markOnlineRoundProcessed(`ROOM:${i}`);
    }

    const raw = getAsyncStorageMap().get(STORAGE_KEY);
    const list = JSON.parse(String(raw)) as string[];

    expect(list).toHaveLength(200);
    expect(list[0]).toBe('ROOM:5');
    expect(list[199]).toBe('ROOM:204');
    expect(await wasOnlineRoundProcessed('ROOM:4')).toBe(false);
    expect(await wasOnlineRoundProcessed('ROOM:204')).toBe(true);
  });
});
