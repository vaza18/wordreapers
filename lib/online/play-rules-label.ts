import type { GameSessionSettings } from '../firebase/types.js';

type TranslateFn = (key: string) => string;

/**
 * Compact rules line for the play screen (proper nouns / slang).
 */
export function formatPlayRulesLabel(
  t: TranslateFn,
  settings?: GameSessionSettings | null,
): string {
  const resolved = settings ?? {
    allowProperNouns: false,
    allowSlang: false,
  };
  const parts: string[] = [];
  if (resolved.allowProperNouns) {
    parts.push(t('online.playRulesProper'));
  }
  if (resolved.allowSlang) {
    parts.push(t('online.playRulesSlang'));
  }
  if (parts.length === 0) {
    return t('online.playRulesStandard');
  }
  if (parts.length === 2) {
    return t('online.playRulesProperAndSlang');
  }
  return parts[0] ?? t('online.playRulesStandard');
}

/**
 * Enabled lexicon options for results/history stats (omit when both off).
 */
export function formatResultsLexiconOptionsSuffix(
  t: TranslateFn,
  settings?: Pick<GameSessionSettings, 'allowProperNouns' | 'allowSlang'> | null,
): string | null {
  const allowProperNouns = settings?.allowProperNouns ?? false;
  const allowSlang = settings?.allowSlang ?? false;
  if (!allowProperNouns && !allowSlang) {
    return null;
  }
  if (allowProperNouns && allowSlang) {
    return t('online.playRulesProperAndSlang');
  }
  if (allowProperNouns) {
    return t('online.playRulesProper');
  }
  return t('online.playRulesSlang');
}
