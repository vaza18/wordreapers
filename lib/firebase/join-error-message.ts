import type { TFunction } from 'i18next';

import { describeFirebaseConfigGap, FIREBASE_CONFIG_ALPHA_DIAGNOSTICS } from './config.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';

function isNetworkError(text: string, code: string | null): boolean {
  return (
    code === 'auth/network-request-failed' ||
    /network request failed/i.test(text) ||
    /\bNETWORK_ERROR\b/.test(text)
  );
}

function isFirebaseConfigError(message: string): boolean {
  return message.includes('Missing EXPO_PUBLIC') || message.includes('not configured');
}

function withAlphaFirebaseDiagnostics(base: string, rawMessage?: string): string {
  if (!FIREBASE_CONFIG_ALPHA_DIAGNOSTICS) {
    return base;
  }
  const details = describeFirebaseConfigGap();
  const parts = [base];
  if (rawMessage?.trim()) {
    parts.push(`[α] ${rawMessage.trim()}`);
  }
  if (details) {
    parts.push(details);
  }
  return parts.join('\n\n');
}

/** User-facing Firebase config error (with optional alpha diagnostics). */
export function firebaseConfigErrorMessage(t: TFunction, rawMessage?: string): string {
  return withAlphaFirebaseDiagnostics(t('online.errorFirebaseConfig'), rawMessage);
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
  if (isFirebaseConfigError(message)) {
    return firebaseConfigErrorMessage(t, message);
  }
  if (isFirebasePermissionDenied(message)) {
    return t('online.errorFirebasePermission');
  }
  if (/api[- ]?key|API_KEY_INVALID/i.test(message)) {
    return t('online.errorFirebaseApiKey');
  }
  if (isNetworkError(message, null) || /connection timed out/i.test(message)) {
    return t('online.errorFirebaseNetwork');
  }
  if (/No Firebase App|FirebaseApp\.configure|initializeAppCheck|App Check/i.test(message)) {
    return withAlphaFirebaseDiagnostics(t('online.errorFirebaseNativeInit'), message);
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
  if (message === 'ROOM_FULL') {
    return t('online.errorRoomFull');
  }
  if (message === 'LANGUAGE_MISMATCH') {
    return t('online.errorLanguageMismatch');
  }
  if (message === 'ROOM_NOT_WAITING' || message === 'ROOM_NOT_JOINABLE') {
    return t('online.errorRoomStarted');
  }
  if (message === 'ROOM_CODE_CONFLICT') {
    return t('online.errorFirebasePermission');
  }
  if (isFirebaseConfigError(message) || message.includes('Firebase is not configured')) {
    return firebaseConfigErrorMessage(t, message);
  }
  if (code === 'auth/operation-not-allowed') {
    return t('online.errorFirebaseAnonymousDisabled');
  }
  if (code === 'auth/api-key-not-valid' || /api[- ]?key/i.test(message)) {
    return t('online.errorFirebaseApiKey');
  }
  if (isNetworkError(message, code)) {
    return t('online.errorFirebaseNetwork');
  }
  if (isFirebasePermissionDenied(error)) {
    return t('online.errorRoomNotFound');
  }

  return t('online.errorJoinFailed');
}
