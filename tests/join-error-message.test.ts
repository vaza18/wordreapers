import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import {
  firebaseBootstrapErrorMessage,
  joinErrorMessage,
} from '../lib/firebase/join-error-message.js';

const t = ((key: string) => key) as TFunction;

describe('joinErrorMessage', () => {
  it('maps known room errors', () => {
    expect(joinErrorMessage(new Error('ROOM_NOT_FOUND'), t)).toBe('online.errorRoomNotFound');
    expect(joinErrorMessage(new Error('ROOM_NOT_JOINABLE'), t)).toBe('online.errorRoomStarted');
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
});

describe('firebaseBootstrapErrorMessage', () => {
  it('maps missing config and api key errors', () => {
    expect(firebaseBootstrapErrorMessage('Missing EXPO_PUBLIC_FIREBASE_API_KEY', t)).toBe(
      'online.errorFirebaseConfig',
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
