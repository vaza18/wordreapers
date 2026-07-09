import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { letterCount, normalizeUk } from '../../lib/dictionary/normalize.js';
import {
  dictBuildIdFromText,
  removeStaleGzArtifacts,
  wordListBody,
} from '../../lib/dictionary/word-list-artifacts.js';
import { ensureDictionaryDirs, UK_LOCALE } from '../../lib/dictionary/index.js';
import { ukDictionaryPaths } from '../../lib/dictionary/paths-node.js';
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

interface WhitelistBuildStats {
  skippedInMain: number;
  skippedBlocklist: number;
  skippedDuplicate: number;
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

async function loadWordListEntries(filePath: string): Promise<Map<string, string>> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const entries = new Map<string, string>();
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const surface = trimmed.toLowerCase();
      const normalized = normalizeUk(surface);
      if (!normalized) {
        continue;
      }
      entries.set(normalized, surface);
    }
    return entries;
  } catch {
    return new Map();
  }
}

async function loadBlocklist(blocklistPath: string): Promise<Set<string>> {
  const entries = await loadWordListEntries(blocklistPath);
  return new Set(entries.keys());
}

function buildWhitelists(
  main: ReadonlyMap<string, string>,
  blocklist: ReadonlySet<string>,
  generalSource: ReadonlyMap<string, string>,
  properSource: ReadonlyMap<string, string>,
  slangSource: ReadonlyMap<string, string>,
): {
  general: Map<string, string>;
  proper: Map<string, string>;
  slang: Map<string, string>;
  stats: WhitelistBuildStats;
} {
  const general = new Map<string, string>();
  const proper = new Map<string, string>();
  const slang = new Map<string, string>();
  const stats: WhitelistBuildStats = {
    skippedInMain: 0,
    skippedBlocklist: 0,
    skippedDuplicate: 0,
  };
  const claimed = new Set<string>();

  function tryAdd(target: Map<string, string>, normalized: string, surface: string): void {
    if (main.has(normalized)) {
      stats.skippedInMain += 1;
      return;
    }
    if (blocklist.has(normalized)) {
      stats.skippedBlocklist += 1;
      return;
    }
    if (claimed.has(normalized)) {
      stats.skippedDuplicate += 1;
      return;
    }
    claimed.add(normalized);
    target.set(normalized, surface);
  }

  for (const [normalized, surface] of Array.from(generalSource)) {
    tryAdd(general, normalized, surface);
  }
  for (const [normalized, surface] of Array.from(properSource)) {
    tryAdd(proper, normalized, surface);
  }
  for (const [normalized, surface] of Array.from(slangSource)) {
    tryAdd(slang, normalized, surface);
  }

  return { general, proper, slang, stats };
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
  return Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'uk'));
}

function buildNormalization(canonical: Map<string, string>): Record<string, string> {
  return Object.fromEntries(
    Array.from(canonical.entries()).filter(([normalized, display]) => normalized !== display),
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

  return Array.from(entries).sort((a, b) => a.localeCompare(b, 'uk'));
}

async function writeWordList(filePath: string, words: string[]): Promise<string> {
  const body = wordListBody(words);
  await writeFile(filePath, body, 'utf8');
  return body;
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

  const [generalSource, properSource, slangSource] = await Promise.all([
    loadWordListEntries(paths.whitelistGeneralSource),
    loadWordListEntries(paths.whitelistProperSource),
    loadWordListEntries(paths.whitelistSlangSource),
  ]);
  const {
    general: whitelistGeneral,
    proper: whitelistProper,
    slang: whitelistSlang,
    stats: whitelistStats,
  } = buildWhitelists(main, blocklist, generalSource, properSource, slangSource);

  ensureDictionaryDirs(ROOT, UK_LOCALE);

  const mainWords = sortedKeys(main);
  const allCanonical = new Map<string, string>([
    ...Array.from(main),
    ...Array.from(supplementProperNouns),
    ...Array.from(supplementSlang),
    ...Array.from(whitelistGeneral),
    ...Array.from(whitelistProper),
    ...Array.from(whitelistSlang),
  ]);
  const normalization = buildNormalization(allCanonical);
  const baseWords = buildBaseWords(main, supplementProperNouns, geographicalProperNouns);
  const baseWordGeoCount = Array.from(geographicalProperNouns).filter(
    (normalized) =>
      letterCount(supplementProperNouns.get(normalized) ?? normalized) >= MIN_BASE_WORD_LENGTH &&
      !main.has(normalized),
  ).length;

  const mainDictionaryBody = await writeWordList(paths.dictionary, mainWords);
  await writeWordList(paths.supplementProperNouns, sortedKeys(supplementProperNouns));
  await writeWordList(paths.supplementSlang, sortedKeys(supplementSlang));
  await writeWordList(paths.whitelistGeneral, sortedKeys(whitelistGeneral));
  await writeWordList(paths.whitelistProperNouns, sortedKeys(whitelistProper));
  await writeWordList(paths.whitelistSlang, sortedKeys(whitelistSlang));
  await writeFile(paths.normalization, `${JSON.stringify(normalization, null, 2)}\n`, 'utf8');
  await writeWordList(paths.baseWords, baseWords);
  removeStaleGzArtifacts(paths);

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
    dictBuildId: dictBuildIdFromText(mainDictionaryBody),
    wordCount: mainWords.length,
    supplementProperNounCount: supplementProperNouns.size,
    supplementSlangCount: supplementSlang.size,
    whitelistGeneralCount: whitelistGeneral.size,
    whitelistProperNounCount: whitelistProper.size,
    whitelistSlangCount: whitelistSlang.size,
    whitelistSkippedInMain: whitelistStats.skippedInMain,
    whitelistSkippedBlocklist: whitelistStats.skippedBlocklist,
    whitelistSkippedDuplicate: whitelistStats.skippedDuplicate,
    whitelistGeneralSource: paths.whitelistGeneralSource,
    whitelistProperSource: paths.whitelistProperSource,
    whitelistSlangSource: paths.whitelistSlangSource,
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
  console.log(`Whitelist general: ${whitelistGeneral.size.toLocaleString()}`);
  console.log(`Whitelist proper nouns: ${whitelistProper.size.toLocaleString()}`);
  console.log(`Whitelist slang: ${whitelistSlang.size.toLocaleString()}`);
  if (
    whitelistStats.skippedInMain > 0 ||
    whitelistStats.skippedBlocklist > 0 ||
    whitelistStats.skippedDuplicate > 0
  ) {
    console.log(
      `Whitelist skipped (in main: ${whitelistStats.skippedInMain}, blocklist: ${whitelistStats.skippedBlocklist}, duplicate: ${whitelistStats.skippedDuplicate})`,
    );
  }
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
