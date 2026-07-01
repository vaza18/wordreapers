import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeGzText } from '../../lib/dictionary/gzip-artifacts.js';
import { UK_LOCALE, ukDictionaryPaths } from '../../lib/dictionary/paths-node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write minimal dictionary artifacts when `assets/generated/dictionaries/` is missing (CI / fresh clone).
 */
async function main(): Promise<void> {
  const paths = ukDictionaryPaths(ROOT);

  if (await pathExists(paths.dictionary)) {
    console.log('Dictionary assets already present — skipping stubs');
    return;
  }

  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.normalization, '{}\n');
  writeGzText(paths.dictionary, '');
  writeGzText(paths.baseWords, '');
  writeGzText(paths.supplementProperNouns, '');
  writeGzText(paths.supplementSlang, '');
  await writeFile(
    paths.meta,
    `${JSON.stringify(
      {
        locale: UK_LOCALE,
        stub: true,
        dictBuildId: 'stub',
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote minimal dictionary stubs to ${paths.dir}`);
}

void main();
