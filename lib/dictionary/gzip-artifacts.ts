import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

import type { DictionaryPaths } from './paths.js';

/** Suffix for gzip-compressed dictionary word lists shipped in the app bundle. */
export const GZ_WORD_LIST_SUFFIX = '.txt.gz';

/** Build gzip artifact filename from logical word-list name (e.g. `dictionary` → `dictionary.txt.gz`). */
export function gzipWordListFilename(basename: string): string {
  return `${basename}${GZ_WORD_LIST_SUFFIX}`;
}

/** Join word list lines for storage (trailing newline when non-empty). */
export function wordListBody(words: readonly string[]): string {
  return words.length ? `${words.join('\n')}\n` : '';
}

/** Write gzip-compressed UTF-8 text (level 9). */
export function writeGzText(filePath: string, content: string): Buffer {
  const gz = gzipSync(Buffer.from(content, 'utf8'), { level: 9 });
  writeFileSync(filePath, gz);
  return gz;
}

/** Read and gunzip a `.txt.gz` artifact (Node scripts/tests). */
export function readGzText(filePath: string): string {
  return gunzipSync(readFileSync(filePath)).toString('utf8');
}

/** SHA-256 hex prefix for cache invalidation (first 16 chars). */
export function dictBuildIdFromGz(gzBytes: Buffer): string {
  return createHash('sha256').update(gzBytes).digest('hex').slice(0, 16);
}

/** Legacy plain `.txt` paths removed after gzip migration. */
export function removeStaleTxtArtifacts(paths: DictionaryPaths): void {
  const legacy = [
    paths.dictionaryLegacyTxt,
    paths.baseWordsLegacyTxt,
    paths.supplementProperNounsLegacyTxt,
    paths.supplementSlangLegacyTxt,
    paths.whitelistGeneralLegacyTxt,
    paths.whitelistProperNounsLegacyTxt,
    paths.whitelistSlangLegacyTxt,
  ];
  for (const filePath of legacy) {
    try {
      unlinkSync(filePath);
    } catch {
      /* already absent */
    }
  }
}

/** Assert generated dictionary dir has no plain `.txt` word lists. */
export function assertNoPlainTxtWordLists(dir: string, entries: string[]): void {
  const plain = entries.filter(
    (name) => name.endsWith('.txt') && !name.endsWith(GZ_WORD_LIST_SUFFIX),
  );
  if (plain.length > 0) {
    throw new Error(`Plain .txt word lists must not remain in ${dir}: ${plain.join(', ')}`);
  }
}
