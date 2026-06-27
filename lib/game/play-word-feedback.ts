import type { PlayWordErrorCode } from './play-word.js';

/** Visual tone for the in-game word feedback chip. */
export type PlayWordFeedbackVariant = 'success' | 'warning' | 'default';

/** Map validation error codes to localized user-facing messages. */
export function playWordErrorMessage(
  t: (key: string) => string,
  code: PlayWordErrorCode | undefined,
): string | null {
  switch (code) {
    case 'TOO_SHORT':
      return t('game.errorTooShort');
    case 'NOT_IN_DICTIONARY':
      return t('game.errorNotInDictionary');
    case 'IS_BASE_WORD':
      return t('game.errorBaseWord');
    case 'INVALID_LETTERS':
      return t('game.errorInvalidLetters');
    case 'ALREADY_SUBMITTED':
      return t('game.errorAlreadySubmitted');
    default:
      return code !== undefined ? t('game.errorUnknown') : null;
  }
}

/** Visual variant for the in-game word feedback chip. */
export function playWordFeedbackVariant(
  accepted: boolean,
  error?: PlayWordErrorCode,
): PlayWordFeedbackVariant {
  if (accepted) {
    return 'success';
  }
  if (error === 'TOO_SHORT' || error === 'NOT_IN_DICTIONARY') {
    return 'warning';
  }
  if (error != null) {
    return 'default';
  }
  return 'default';
}
