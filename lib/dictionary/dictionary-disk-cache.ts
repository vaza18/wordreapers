import { Asset } from 'expo-asset';
import { gunzipSync } from 'fflate';
import {
  cacheDirectory,
  deleteAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { getAppVersionInfo } from '@/lib/app-version';
import { DICTIONARY_CACHE_PLAIN_FILES, UK_LOCALE } from '@/lib/dictionary/paths';

import bundledMeta from '../../assets/generated/dictionaries/uk-uk/meta.json';

import { BUNDLED_DICTIONARY_GZ_MODULES } from './bundled-dictionary-assets.js';

/** Metro-bundled gzip word lists under `assets/generated/dictionaries/uk-uk/`. */
const GZ_ASSET_MODULES = BUNDLED_DICTIONARY_GZ_MODULES;

type GzAssetKey = keyof typeof GZ_ASSET_MODULES;

const WORD_LIST_ASSETS: ReadonlyArray<{
  assetKey: GzAssetKey;
  plainName: (typeof DICTIONARY_CACHE_PLAIN_FILES)[keyof typeof DICTIONARY_CACHE_PLAIN_FILES];
}> = [
  { assetKey: 'dictionary', plainName: DICTIONARY_CACHE_PLAIN_FILES.dictionary },
  { assetKey: 'baseWords', plainName: DICTIONARY_CACHE_PLAIN_FILES.baseWords },
  {
    assetKey: 'supplementProperNouns',
    plainName: DICTIONARY_CACHE_PLAIN_FILES.supplementProperNouns,
  },
  { assetKey: 'supplementSlang', plainName: DICTIONARY_CACHE_PLAIN_FILES.supplementSlang },
  { assetKey: 'whitelistGeneral', plainName: DICTIONARY_CACHE_PLAIN_FILES.whitelistGeneral },
  {
    assetKey: 'whitelistProperNouns',
    plainName: DICTIONARY_CACHE_PLAIN_FILES.whitelistProperNouns,
  },
  { assetKey: 'whitelistSlang', plainName: DICTIONARY_CACHE_PLAIN_FILES.whitelistSlang },
];

type CacheManifest = {
  appVersion: string | null;
  dictBuildId: string;
  extractedAt: string;
  files: string[];
};

type BundledDictionaryMeta = {
  dictBuildId?: string;
};

function cacheRootUri(): string {
  if (!cacheDirectory) {
    throw new Error('cacheDirectory unavailable');
  }
  return `${cacheDirectory}dictionaries/${UK_LOCALE}/`;
}

function cacheManifestUri(): string {
  return `${cacheRootUri()}cache-manifest.json`;
}

function coerceAssetModule(
  moduleRef: unknown,
): number | { uri: string; width: number; height: number } {
  if (typeof moduleRef === 'number') {
    return moduleRef;
  }
  if (!moduleRef || typeof moduleRef !== 'object') {
    throw new Error('Invalid asset module');
  }
  if ('default' in moduleRef) {
    return coerceAssetModule(moduleRef.default);
  }
  const record = moduleRef as { uri?: unknown; width?: number; height?: number };
  if (typeof record.uri === 'string') {
    return {
      uri: record.uri,
      width: record.width ?? 0,
      height: record.height ?? 0,
    };
  }
  throw new Error('Invalid asset module');
}

async function readGzAssetBytes(moduleRef: unknown): Promise<Uint8Array> {
  const asset = Asset.fromModule(coerceAssetModule(moduleRef));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('Asset URI missing after download');
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read bundled dictionary asset: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function readCacheManifest(): Promise<CacheManifest | null> {
  try {
    const raw = await readAsStringAsync(cacheManifestUri());
    return JSON.parse(raw) as CacheManifest;
  } catch {
    return null;
  }
}

function bundledDictBuildId(): string {
  const meta = bundledMeta as BundledDictionaryMeta;
  return meta.dictBuildId ?? 'unknown';
}

const REQUIRED_CACHE_PLAIN_FILES = WORD_LIST_ASSETS.map((asset) => asset.plainName);

function isCacheManifestCurrent(
  manifest: CacheManifest | null,
  appVersion: string | null,
  dictBuildId: string,
): boolean {
  if (!manifest || manifest.appVersion !== appVersion || manifest.dictBuildId !== dictBuildId) {
    return false;
  }
  const cached = new Set(manifest.files);
  return REQUIRED_CACHE_PLAIN_FILES.every((plainName) => cached.has(plainName));
}

async function extractBundledWordListsToDisk(): Promise<void> {
  const root = cacheRootUri();
  await deleteAsync(root, { idempotent: true });
  await makeDirectoryAsync(root, { intermediates: true });

  const files: string[] = [];
  for (const { assetKey, plainName } of WORD_LIST_ASSETS) {
    const gzBytes = await readGzAssetBytes(GZ_ASSET_MODULES[assetKey]);
    const text = new TextDecoder().decode(gunzipSync(gzBytes));
    await writeAsStringAsync(`${root}${plainName}`, text);
    files.push(plainName);
  }

  const { version: appVersion } = getAppVersionInfo();
  const manifest: CacheManifest = {
    appVersion,
    dictBuildId: bundledDictBuildId(),
    extractedAt: new Date().toISOString(),
    files,
  };
  await writeAsStringAsync(cacheManifestUri(), `${JSON.stringify(manifest)}\n`);
}

let ensurePromise: Promise<void> | null = null;

/**
 * Ensure plain word lists exist on disk (extract gzip bundle once per app version / dict build).
 */
export async function ensureDictionaryDiskCache(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const { version: appVersion } = getAppVersionInfo();
      const dictBuildId = bundledDictBuildId();
      const manifest = await readCacheManifest();
      if (isCacheManifestCurrent(manifest, appVersion, dictBuildId)) {
        return;
      }
      await extractBundledWordListsToDisk();
    })();
  }
  await ensurePromise;
}

/** Read a plain word list from the on-device dictionary cache. */
export async function readCachedDictionaryText(
  plainName: (typeof DICTIONARY_CACHE_PLAIN_FILES)[keyof typeof DICTIONARY_CACHE_PLAIN_FILES],
): Promise<string> {
  await ensureDictionaryDiskCache();
  return readAsStringAsync(`${cacheRootUri()}${plainName}`);
}

/** Reset in-flight ensure (tests only). */
export function resetDictionaryDiskCacheForTests(): void {
  ensurePromise = null;
}
