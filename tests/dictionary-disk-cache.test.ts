import { beforeEach, describe, expect, it, vi } from 'vitest';

const readAsStringAsync = vi.fn();
const writeAsStringAsync = vi.fn();
const deleteAsync = vi.fn();
const makeDirectoryAsync = vi.fn();

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  readAsStringAsync: (...args: unknown[]) => readAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => writeAsStringAsync(...args),
  deleteAsync: (...args: unknown[]) => deleteAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => makeDirectoryAsync(...args),
}));

vi.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      downloadAsync: vi.fn().mockResolvedValue(undefined),
      localUri: 'file:///bundle/dictionary.gz',
      uri: 'file:///bundle/dictionary.gz',
    }),
  },
}));

vi.mock('@/lib/app-version', () => ({
  getAppVersionInfo: () => ({ version: '1.0.0', buildNumber: '1' }),
}));

vi.mock('../../assets/generated/dictionaries/uk-uk/meta.json', () => ({
  default: { dictBuildId: 'build-1' },
}));

vi.mock('../lib/dictionary/bundled-dictionary-assets.js', () => ({
  BUNDLED_DICTIONARY_GZ_MODULES: {
    dictionary: 1,
    baseWords: 2,
    supplementProperNouns: 3,
    supplementSlang: 4,
    whitelistGeneral: 5,
    whitelistProperNouns: 6,
    whitelistSlang: 7,
  },
}));

vi.mock('fflate', () => ({
  gunzipSync: () => new TextEncoder().encode('word1\nword2'),
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}) as typeof fetch;

import { DICTIONARY_CACHE_PLAIN_FILES } from '../lib/dictionary/paths.js';

describe('dictionary-disk-cache', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    deleteAsync.mockResolvedValue(undefined);
    makeDirectoryAsync.mockResolvedValue(undefined);
    writeAsStringAsync.mockResolvedValue(undefined);
    readAsStringAsync.mockResolvedValue('');
  });

  it('extracts bundled gzip assets when manifest is missing', async () => {
    readAsStringAsync.mockRejectedValue(new Error('missing'));

    const { ensureDictionaryDiskCache: ensureCache } =
      await import('../lib/dictionary/dictionary-disk-cache.js');
    await ensureCache();

    expect(deleteAsync).toHaveBeenCalled();
    expect(makeDirectoryAsync).toHaveBeenCalled();
    expect(writeAsStringAsync).toHaveBeenCalled();
  });

  it('reads plain dictionary text after ensuring cache', async () => {
    readAsStringAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('cache-manifest.json')) {
        return JSON.stringify({
          appVersion: '1.0.0',
          dictBuildId: 'build-1',
          extractedAt: 'now',
          files: Object.values(DICTIONARY_CACHE_PLAIN_FILES),
        });
      }
      return 'word-list';
    });

    const { readCachedDictionaryText } = await import('../lib/dictionary/dictionary-disk-cache.js');
    const text = await readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.dictionary);
    expect(text).toBe('word-list');
  });

  it('re-extracts when manifest is missing new whitelist files', async () => {
    readAsStringAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('cache-manifest.json')) {
        return JSON.stringify({
          appVersion: '1.0.0',
          dictBuildId: 'build-1',
          extractedAt: 'now',
          files: [
            DICTIONARY_CACHE_PLAIN_FILES.dictionary,
            DICTIONARY_CACHE_PLAIN_FILES.baseWords,
            DICTIONARY_CACHE_PLAIN_FILES.supplementProperNouns,
            DICTIONARY_CACHE_PLAIN_FILES.supplementSlang,
          ],
        });
      }
      throw new Error('missing');
    });

    const { ensureDictionaryDiskCache: ensureCache } =
      await import('../lib/dictionary/dictionary-disk-cache.js');
    await ensureCache();

    expect(deleteAsync).toHaveBeenCalled();
    expect(makeDirectoryAsync).toHaveBeenCalled();
    expect(writeAsStringAsync).toHaveBeenCalled();
  });
});
