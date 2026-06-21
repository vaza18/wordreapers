import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { letterCount, normalizeUk } from '../../lib/dictionary/normalize.js';
import { ensureDictionaryDirs, UK_LOCALE } from '../../lib/dictionary/index.js';
import { ukDictionaryPaths } from '../../lib/dictionary/paths.js';
import {
  isBaseWordGeographicalEntry,
  isMainDictionaryEntry,
  isSupplementProperNounEntry,
  isSupplementSlangEntry,
  parseVesumLine,
} from '../../lib/dictionary/vesum-tags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VESUM_TXT = path.join(ROOT, '.data', 'vesum', 'dict_corp_vis.txt');
const MANIFEST_PATH = path.join(ROOT, '.data', 'vesum', 'manifest.json');

const MIN_BASE_WORD_LENGTH = 8;

interface BuildStats {
  linesRead: number;
  entriesAccepted: number;
  duplicatesSkipped: number;
  excludedBlocklist: number;
  mainWords: number;
  supplementProperNouns: number;
  supplementSlang: number;
}

function addCanonical(
  canonical: Map<string, string>,
  normalized: string,
  surface: string,
  stats: BuildStats,
): void {
  stats.entriesAccepted += 1;
  const existing = canonical.get(normalized);
  if (!existing) {
    canonical.set(normalized, surface);
    return;
  }

  stats.duplicatesSkipped += 1;
  if (surface.includes("'") && !existing.includes("'")) {
    canonical.set(normalized, surface);
  }
}

async function loadBlocklist(blocklistPath: string): Promise<Set<string>> {
  try {
    const raw = await readFile(blocklistPath, 'utf8');
    return new Set(
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((word) => normalizeUk(word)),
    );
  } catch {
    return new Set();
  }
}

async function buildFromVesum(
  sourcePath: string,
  blocklist: ReadonlySet<string>,
): Promise<{
  main: Map<string, string>;
  supplementProperNouns: Map<string, string>;
  geographicalProperNouns: Set<string>;
  supplementSlang: Map<string, string>;
  stats: BuildStats;
}> {
  const main = new Map<string, string>();
  const supplementProperNouns = new Map<string, string>();
  const geographicalProperNouns = new Set<string>();
  const supplementSlang = new Map<string, string>();
  const stats: BuildStats = {
    linesRead: 0,
    entriesAccepted: 0,
    duplicatesSkipped: 0,
    excludedBlocklist: 0,
    mainWords: 0,
    supplementProperNouns: 0,
    supplementSlang: 0,
  };

  const rl = createInterface({
    input: createReadStream(sourcePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    stats.linesRead += 1;
    const parsed = parseVesumLine(line);
    if (!parsed) {
      continue;
    }

    const normalized = normalizeUk(parsed.word);
    if (!normalized) {
      continue;
    }

    if (blocklist.has(normalized)) {
      stats.excludedBlocklist += 1;
      continue;
    }

    const surface = parsed.word.toLowerCase();
    const { tags } = parsed;

    if (isMainDictionaryEntry(tags)) {
      addCanonical(main, normalized, surface, stats);
      continue;
    }

    if (isSupplementProperNounEntry(tags)) {
      addCanonical(supplementProperNouns, normalized, surface, stats);
      if (isBaseWordGeographicalEntry(tags)) {
        geographicalProperNouns.add(normalized);
      }
      continue;
    }

    if (isSupplementSlangEntry(tags)) {
      addCanonical(supplementSlang, normalized, surface, stats);
    }
  }

  stats.mainWords = main.size;
  stats.supplementProperNouns = supplementProperNouns.size;
  stats.supplementSlang = supplementSlang.size;

  return { main, supplementProperNouns, geographicalProperNouns, supplementSlang, stats };
}

function sortedKeys(map: Map<string, string>): string[] {
  return [...map.keys()].sort((a, b) => a.localeCompare(b, 'uk'));
}

function buildNormalization(canonical: Map<string, string>): Record<string, string> {
  return Object.fromEntries(
    [...canonical.entries()].filter(([normalized, display]) => normalized !== display),
  );
}

function buildBaseWords(
  main: Map<string, string>,
  supplementProperNouns: Map<string, string>,
  geographicalProperNouns: ReadonlySet<string>,
): string[] {
  const entries = new Set<string>();

  for (const normalized of sortedKeys(main)) {
    const surface = main.get(normalized) ?? normalized;
    if (letterCount(surface) < MIN_BASE_WORD_LENGTH) {
      continue;
    }
    entries.add(normalized);
  }

  for (const normalized of sortedKeys(supplementProperNouns)) {
    if (!geographicalProperNouns.has(normalized)) {
      continue;
    }
    const surface = supplementProperNouns.get(normalized) ?? normalized;
    if (letterCount(surface) < MIN_BASE_WORD_LENGTH || entries.has(normalized)) {
      continue;
    }
    entries.add(normalized);
  }

  return [...entries].sort((a, b) => a.localeCompare(b, 'uk'));
}

async function writeWordList(filePath: string, words: string[]): Promise<void> {
  await writeFile(filePath, words.length ? `${words.join('\n')}\n` : '', 'utf8');
}

async function main(): Promise<void> {
  const paths = ukDictionaryPaths(ROOT);
  const sourceExists = await readFile(VESUM_TXT, 'utf8')
    .then(() => true)
    .catch(() => false);
  if (!sourceExists) {
    console.error(`Missing ${VESUM_TXT}. Run: npm run dict:fetch`);
    process.exit(1);
  }

  console.log('Building dictionary from VESUM…');
  const blocklist = await loadBlocklist(paths.blocklist);
  const { main, supplementProperNouns, geographicalProperNouns, supplementSlang, stats } =
    await buildFromVesum(VESUM_TXT, blocklist);

  ensureDictionaryDirs(ROOT, UK_LOCALE);

  const mainWords = sortedKeys(main);
  const allCanonical = new Map([...main, ...supplementProperNouns, ...supplementSlang]);
  const normalization = buildNormalization(allCanonical);
  const baseWords = buildBaseWords(main, supplementProperNouns, geographicalProperNouns);
  const baseWordGeoCount = [...geographicalProperNouns].filter(
    (normalized) =>
      letterCount(supplementProperNouns.get(normalized) ?? normalized) >= MIN_BASE_WORD_LENGTH &&
      !main.has(normalized),
  ).length;

  await writeWordList(paths.dictionary, mainWords);
  await writeWordList(paths.supplementProperNouns, sortedKeys(supplementProperNouns));
  await writeWordList(paths.supplementSlang, sortedKeys(supplementSlang));
  await writeFile(paths.normalization, `${JSON.stringify(normalization, null, 2)}\n`, 'utf8');
  await writeWordList(paths.baseWords, baseWords);

  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
  } catch {
    /* no manifest yet */
  }

  const meta = {
    ...manifest,
    locale: UK_LOCALE,
    builtAt: new Date().toISOString(),
    wordCount: mainWords.length,
    supplementProperNounCount: supplementProperNouns.size,
    supplementSlangCount: supplementSlang.size,
    normalizationEntryCount: Object.keys(normalization).length,
    baseWordCount: baseWords.length,
    baseWordGeoCount,
    minBaseWordLength: MIN_BASE_WORD_LENGTH,
    excludedBlocklistCount: stats.excludedBlocklist,
    blocklistFile: paths.blocklist,
    sourceFile: VESUM_TXT,
  };
  await writeFile(paths.meta, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  console.log(`Lines read: ${stats.linesRead.toLocaleString()}`);
  console.log(`Accepted entries: ${stats.entriesAccepted.toLocaleString()}`);
  console.log(`Main dictionary: ${mainWords.length.toLocaleString()}`);
  console.log(`Supplement proper nouns: ${supplementProperNouns.size.toLocaleString()}`);
  console.log(`Supplement slang: ${supplementSlang.size.toLocaleString()}`);
  console.log(`Excluded blocklist: ${stats.excludedBlocklist.toLocaleString()}`);
  console.log(`Normalization map: ${Object.keys(normalization).length.toLocaleString()}`);
  console.log(
    `Base words (≥${MIN_BASE_WORD_LENGTH}): ${baseWords.length.toLocaleString()} (${baseWordGeoCount.toLocaleString()} geographical proper nouns)`,
  );
  console.log(`Dictionary written to ${paths.dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
