import type { TFunction } from 'i18next';

function isPermissionDenied(text: string): boolean {
  return /permission[-_]?denied/i.test(text);
}

function isNetworkError(text: string, code: string | null): boolean {
  return (
    code === 'auth/network-request-failed' ||
    /network request failed/i.test(text) ||
    /\bNETWORK_ERROR\b/.test(text)
  );
}

/** Map Firebase bootstrap `errorMessage` strings to UI copy. */
export function firebaseBootstrapErrorMessage(
  errorMessage: string | null | undefined,
  t: TFunction,
): string {
  const message = errorMessage?.trim() ?? '';
  if (!message) {
    return t('online.errorFirebaseNetwork');
  }
  if (message.includes('Missing EXPO_PUBLIC') || message.includes('not configured')) {
    return t('online.errorFirebaseConfig');
  }
  if (isPermissionDenied(message)) {
    return t('online.errorFirebasePermission');
  }
  if (/api[- ]?key|API_KEY_INVALID/i.test(message)) {
    return t('online.errorFirebaseApiKey');
  }
  if (isNetworkError(message, null) || /connection timed out/i.test(message)) {
    return t('online.errorFirebaseNetwork');
  }
  return t('online.errorJoinFailed');
}

function firebaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  const code = error.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Map join-room failures to a short user-facing message (uk i18n keys).
 */
export function joinErrorMessage(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = firebaseErrorCode(error);

  if (message === 'ROOM_NOT_FOUND') {
    return t('online.errorRoomNotFound');
  }
  if (message === 'ROOM_NOT_WAITING' || message === 'ROOM_NOT_JOINABLE') {
    return t('online.errorRoomStarted');
  }
  if (message.includes('Missing EXPO_PUBLIC') || message.includes('Firebase is not configured')) {
    return t('online.errorFirebaseConfig');
  }
  if (code === 'permission-denied' || isPermissionDenied(message)) {
    return t('online.errorFirebasePermission');
  }
  if (code === 'auth/api-key-not-valid' || /api[- ]?key/i.test(message)) {
    return t('online.errorFirebaseApiKey');
  }
  if (isNetworkError(message, code)) {
    return t('online.errorFirebaseNetwork');
  }

  return t('online.errorJoinFailed');
}
