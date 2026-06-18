/** Player gender for Ukrainian UI agreement (TZ §5). */
export type PlayerGender = 'f' | 'm' | null;

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** i18n key suffix for gendered copy (`_f` / `_m` / `_n`). */
export function genderedI18nKey(baseKey: string, gender: PlayerGender): string {
  if (gender === 'f') {
    return `${baseKey}_f`;
  }
  if (gender === 'm') {
    return `${baseKey}_m`;
  }
  return `${baseKey}_n`;
}

/**
 * Pick a gendered i18n string; falls back to neutral when a variant is missing.
 */
export function tGendered(
  t: TranslateFn,
  baseKey: string,
  gender: PlayerGender,
  params?: Record<string, string | number>,
): string {
  const key = genderedI18nKey(baseKey, gender);
  const text = t(key, params);
  if (text !== key) {
    return text;
  }
  return t(genderedI18nKey(baseKey, null), params);
}

interface WinnerLineParams extends Record<string, string | number> {
  name: string;
  score: number;
  words: number;
}

/**
 * Headline for results screen: «Юля перемогла» / «Артем переміг» / neutral.
 */
export function formatWinnerHeadline(
  t: TranslateFn,
  gender: PlayerGender,
  params: WinnerLineParams,
): string {
  if (gender === 'f') {
    return t('game.winnerLineFemale', params);
  }
  if (gender === 'm') {
    return t('game.winnerLineMale', params);
  }
  return t('game.winnerLineNeutral', params);
}
