/** Ukrainian plural bucket for nouns like «гравець» / «слово». */
export type UkPluralForm = 'one' | 'few' | 'many';

/**
 * Slavic-style plural form: …1 (not …11), …2–4 (not …12–14), else many.
 * Penultimate digit 1 blocks the …1 and …2–4 rules (11, 12, 111, 1011, …).
 */
export function ukPluralForm(count: number): UkPluralForm {
  const abs = Math.abs(Math.trunc(count));
  const mod10 = abs % 10;
  const penultimate = Math.floor(abs / 10) % 10;

  if (mod10 === 1 && penultimate !== 1) {
    return 'one';
  }
  if (mod10 >= 2 && mod10 <= 4 && penultimate !== 1) {
    return 'few';
  }
  return 'many';
}

const PLAYER_FORMS: Record<UkPluralForm, string> = {
  one: 'гравець',
  few: 'гравці',
  many: 'гравців',
};

const WORD_FORMS: Record<UkPluralForm, string> = {
  one: 'слово',
  few: 'слова',
  many: 'слів',
};

/** «1 гравець», «2 гравці», «5 гравців», … */
export function formatUkPlayers(count: number): string {
  return `${count} ${PLAYER_FORMS[ukPluralForm(count)]}`;
}

/** «1 слово», «2 слова», «5 слів», … */
export function formatUkWords(count: number): string {
  return `${count} ${WORD_FORMS[ukPluralForm(count)]}`;
}
