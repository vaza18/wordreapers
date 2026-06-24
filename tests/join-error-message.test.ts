import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { extra: {} },
  },
}));

import {
  firebaseBootstrapErrorMessage,
  firebaseConfigErrorMessage,
  joinErrorMessage,
} from '../lib/firebase/join-error-message.js';

const t = ((key: string) => key) as TFunction;

describe('joinErrorMessage', () => {
  it('maps known room errors', () => {
    expect(joinErrorMessage(new Error('ROOM_NOT_FOUND'), t)).toBe('online.errorRoomNotFound');
    expect(joinErrorMessage(new Error('ROOM_NOT_JOINABLE'), t)).toBe('online.errorRoomStarted');
    expect(joinErrorMessage(new Error('ROOM_FULL'), t)).toBe('online.errorRoomFull');
    expect(joinErrorMessage(new Error('LANGUAGE_MISMATCH'), t)).toBe(
      'online.errorLanguageMismatch',
    );
  });

  it('maps firebase permission and network failures', () => {
    expect(joinErrorMessage({ code: 'permission-denied' }, t)).toBe(
      'online.errorFirebasePermission',
    );
    expect(joinErrorMessage({ code: 'auth/network-request-failed' }, t)).toBe(
      'online.errorFirebaseNetwork',
    );
  });

  it('falls back to generic join failure', () => {
    expect(joinErrorMessage(new Error('something else'), t)).toBe('online.errorJoinFailed');
  });

  it('appends alpha diagnostics for missing firebase config', () => {
    const message = joinErrorMessage(
      new Error('Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to .env'),
      t,
    );
    expect(message).toContain('online.errorFirebaseConfig');
    expect(message).toContain('[α] Firebase config');
  });
});

describe('firebaseBootstrapErrorMessage', () => {
  it('maps missing config and api key errors', () => {
    expect(firebaseBootstrapErrorMessage('Missing EXPO_PUBLIC_FIREBASE_API_KEY', t)).toContain(
      'online.errorFirebaseConfig',
    );
    expect(firebaseBootstrapErrorMessage('Missing EXPO_PUBLIC_FIREBASE_API_KEY', t)).toContain(
      'Missing EXPO_PUBLIC_FIREBASE_API_KEY',
    );
    expect(firebaseBootstrapErrorMessage('API_KEY_INVALID', t)).toBe('online.errorFirebaseApiKey');
  });

  it('uses network message for empty bootstrap errors', () => {
    expect(firebaseBootstrapErrorMessage(null, t)).toBe('online.errorFirebaseNetwork');
  });

  it('maps RTDB connection timeout to network message', () => {
    expect(firebaseBootstrapErrorMessage('RTDB connection timed out', t)).toBe(
      'online.errorFirebaseNetwork',
    );
  });
});

describe('firebaseConfigErrorMessage', () => {
  it('includes alpha diagnostics block', () => {
    const message = firebaseConfigErrorMessage(t, 'Missing EXPO_PUBLIC_FIREBASE_* in .env');
    expect(message).toContain('online.errorFirebaseConfig');
    expect(message).toContain('Missing EXPO_PUBLIC_FIREBASE_* in .env');
    expect(message).toContain('[α] Firebase config');
  });
});
