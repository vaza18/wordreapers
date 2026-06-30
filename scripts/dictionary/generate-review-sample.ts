import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDictionaryUk } from '../../lib/dictionary/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = path.join(ROOT, 'docs', 'dictionary_review_sample.md');

const SAMPLE_SIZE = 100;

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(items: T[], count: number, rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

async function main(): Promise<void> {
  const dict = loadDictionaryUk(ROOT);
  const words = [...dict.readonlyWords()];

  const rng = mulberry32(42);
  const sample = pickRandom(words, Math.min(SAMPLE_SIZE, words.length), rng).sort((a, b) =>
    a.localeCompare(b, 'uk'),
  );

  const lines = [
    '# Перевірка вибірки словника',
    '',
    '> Згенеровано `npm run dict:review-sample`. Познач: ✓ ок · ✗ сміття · ? сумнівно',
    '',
    '| # | Слово (норм.) | Відображення | Оцінка | Коментар |',
    '|---:|---|---|---|---|',
  ];

  sample.forEach((normalized, index) => {
    const display = dict.lookupDisplay(normalized) ?? normalized;
    lines.push(`| ${index + 1} | \`${normalized}\` | \`${display}\` | | |`);
  });

  lines.push(
    '',
    '---',
    '',
    'Після перевірки напиши в чат скільки ✗/?, або онови коментарі тут у PR.',
  );

  await writeFile(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${sample.length} words to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
