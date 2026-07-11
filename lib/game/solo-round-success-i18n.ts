import type { TFunction } from 'i18next';

import { soloSuccessMedal, type SoloSuccessLevelId } from '@/lib/game/solo-round-success';
import { ukWordForm } from '@/lib/i18n/uk-plural';

const LEVEL_TITLE_KEYS: Record<Exclude<SoloSuccessLevelId, 'none'>, string> = {
  progress: 'soloSuccess.levelProgress',
  goodPace: 'soloSuccess.levelGoodPace',
  strong: 'soloSuccess.levelStrong',
  top: 'soloSuccess.levelTop',
  champion: 'soloSuccess.levelChampion',
};

/** Localized title for a success level, or null for `none`. */
export function soloSuccessLevelTitle(t: TFunction, levelId: SoloSuccessLevelId): string | null {
  if (levelId === 'none') {
    return null;
  }
  return t(LEVEL_TITLE_KEYS[levelId]);
}

/** e.g. "🥈 Топ раунду" or "Гарний темп". */
export function formatSoloSuccessBadge(t: TFunction, levelId: SoloSuccessLevelId): string | null {
  const title = soloSuccessLevelTitle(t, levelId);
  if (!title) {
    return null;
  }
  const medal = soloSuccessMedal(levelId);
  return t('soloSuccess.badgeLabel', {
    medal: medal ? `${medal} ` : '',
    title,
  });
}

/** e.g. "🥈 Топ раунду · 25 слів". */
export function formatSoloSuccessHistoryHeadline(
  t: TFunction,
  levelId: SoloSuccessLevelId,
  wordCount: number,
): string | null {
  const title = soloSuccessLevelTitle(t, levelId);
  if (!title) {
    return null;
  }
  const medal = soloSuccessMedal(levelId);
  return t('soloSuccess.historyHeadline', {
    medal: medal ? `${medal} ` : '',
    title,
    words: wordCount,
    wordForm: ukWordForm(wordCount),
  });
}

/** Level-up toast body for mid-round feedback. */
export function formatSoloSuccessLevelUpToast(
  t: TFunction,
  levelId: SoloSuccessLevelId,
): string | null {
  const title = soloSuccessLevelTitle(t, levelId);
  if (!title || levelId === 'none') {
    return null;
  }
  const medal = soloSuccessMedal(levelId);
  return t('soloSuccess.levelUp', {
    medal: medal ? `${medal} ` : '',
    title,
  });
}
