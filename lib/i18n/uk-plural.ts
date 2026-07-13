import i18n from '@/i18n';

/** Non-breaking space — keep «N одиниця» from wrapping apart in Text. */
export const NBSP = '\u00A0';

/** Ukrainian plural bucket for nouns like «гравець» / «слово». */
export type UkPluralForm = 'one' | 'few' | 'many';

/**
 * Slavic-style plural form: …1 (not …11), …2–4 (not …12–14), else many.
 * Penultimate digit 1 blocks the …1 and …2–4 rules (11, 12, 111, 1011, …).
 *
 * Prefer this over i18next `{ count }` pluralization: Hermes/Intl often lacks
 * Ukrainian few/many and falls back to English one/other (wrong «2 раундів»).
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

/** Join a count with its unit using a non-breaking space. */
export function joinCountUnit(count: number | string, unit: string): string {
  return `${count}${NBSP}${unit}`;
}

function tPlural(baseKey: string, count: number): string {
  const raw = i18n.t(`${baseKey}_${ukPluralForm(count)}`, { count });
  // Templates use a normal space; normalize so RN Text won't split «144 слова».
  return raw.replace(/^(\d+)\s+/u, `$1${NBSP}`);
}

/** «слово» / «слова» / «слів» for a given count (without the number). */
export function ukWordForm(count: number): string {
  return tPlural('plurals.wordForm', count);
}

/** «1 гра», «2 гри», «5 ігор», … */
export function formatUkGames(count: number): string {
  return tPlural('plurals.game', count);
}

/** «1 гравець», «2 гравці», «5 гравців», … */
export function formatUkPlayers(count: number): string {
  return tPlural('plurals.player', count);
}

/** «1 слово», «2 слова», «5 слів», … */
export function formatUkWords(count: number): string {
  return tPlural('plurals.word', count);
}

/** «1 перемога», «2 перемоги», «5 перемог», … */
export function formatUkWins(count: number): string {
  return tPlural('plurals.win', count);
}

/** «1 раунд», «2 раунди», «5 раундів», … */
export function formatUkRounds(count: number): string {
  return tPlural('plurals.round', count);
}

/** «1 очко», «2 очки», «5 очок», … */
export function formatUkPoints(count: number): string {
  return tPlural('game.pointsLabel', count);
}
