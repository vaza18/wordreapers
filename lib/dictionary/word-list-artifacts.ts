import { createHash } from 'node:crypto';
import { unlinkSync } from 'node:fs';

import type { DictionaryPaths } from './paths.js';

/** Join word list lines for storage (trailing newline when non-empty). */
export function wordListBody(words: readonly string[]): string {
  return words.length ? `${words.join('\n')}\n` : '';
}

/** SHA-256 hex prefix for dictionary build identity (first 16 chars). */
export function dictBuildIdFromText(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Legacy `.txt.gz` paths removed after plain-text migration. */
export function removeStaleGzArtifacts(paths: DictionaryPaths): void {
  const legacy = [
    paths.dictionaryGz,
    paths.baseWordsGz,
    paths.supplementProperNounsGz,
    paths.supplementSlangGz,
    paths.whitelistGeneralGz,
    paths.whitelistProperNounsGz,
    paths.whitelistSlangGz,
  ];
  for (const filePath of legacy) {
    try {
      unlinkSync(filePath);
    } catch {
      /* already absent */
    }
  }
}
