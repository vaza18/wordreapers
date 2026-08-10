import { toDisplayUpper } from '@/lib/dictionary/normalize';

/** Space-separated uppercase letters for a training hint (e.g. «Е К Ю»). */
export function formatWordHintLetters(displayWord: string): string {
  const upper = toDisplayUpper(displayWord.trim());
  return [...upper].join(' ');
}
