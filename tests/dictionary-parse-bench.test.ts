import { readFileSync, unlinkSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createDictionaryIndex } from '../lib/dictionary/dictionary-index.js';
import { readGzText, writeGzText, wordListBody } from '../lib/dictionary/gzip-artifacts.js';
import { ukDictionaryPaths } from '../lib/dictionary/paths-node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Baseline guardrail: dictionary index build should stay within a reasonable bound.
 */
describe('dictionary parse bench', () => {
  it('builds index from bundled dictionary within time budget', () => {
    const paths = ukDictionaryPaths(ROOT);
    let dictionaryText: string;
    try {
      dictionaryText = readGzText(paths.dictionary);
    } catch {
      return;
    }
    if (!dictionaryText.trim()) {
      return;
    }

    const normalizationJson = readFileSync(paths.normalization, 'utf8');
    const start = performance.now();
    const index = createDictionaryIndex(dictionaryText, normalizationJson);
    const elapsedMs = performance.now() - start;

    expect(index.hasWord('порт')).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);
  });
});

describe('gzip dictionary artifacts', () => {
  it('round-trips word list through gzip', () => {
    const words = ['абетка', 'порт', 'тор'];
    const body = wordListBody(words);
    const tmp = path.join(ROOT, 'tests', '.tmp-dict.gz');
    writeGzText(tmp, body);
    const restored = readGzText(tmp);
    expect(restored).toBe(body);
    const index = createDictionaryIndex(restored, {});
    expect(index.hasWord('порт')).toBe(true);
    unlinkSync(tmp);
  });
});
