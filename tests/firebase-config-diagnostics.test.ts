import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExtra = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));
const mockPlatform = vi.hoisted(() => ({ OS: 'android' as 'android' | 'ios' }));

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: mockExtra.current };
    },
  },
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

describe('describeFirebaseConfigGap', () => {
  beforeEach(() => {
    mockExtra.current = {};
    mockPlatform.OS = 'android';
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when firebase config resolves for the current platform', async () => {
    mockExtra.current = {
      firebaseApiKey: 'abc',
      firebaseDatabaseURL: 'https://example.firebaseio.com',
      firebaseProjectId: 'demo',
      firebaseAppIdAndroid: '1:x:android:demo',
    };
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    expect(describeFirebaseConfigGap()).toBeNull();
  });

  it('lists missing extra and env keys without exposing values', async () => {
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    const report = describeFirebaseConfigGap();
    expect(report).toContain('[α] Firebase config');
    expect(report).toContain('firebaseApiKey: порожньо');
    expect(report).toContain('firebaseAppIdAndroid: порожньо');
    expect(report).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    expect(report).toContain('EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID');
    expect(report).not.toContain('EXPO_PUBLIC_FIREBASE_APP_ID_IOS');
    expect(report).toContain('resolve(): немає');
    expect(report).not.toContain('abc');
  });

  it('reports partial extra presence by length only, never the raw value', async () => {
    const secretApiKey = 'super-secret-api-key-value';
    mockExtra.current = {
      firebaseApiKey: secretApiKey,
      // still incomplete → gap report, not null
    };
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    const report = describeFirebaseConfigGap();
    expect(report).not.toBeNull();
    expect(report).toContain(`firebaseApiKey: ${secretApiKey.length} симв.`);
    expect(report).toContain('firebaseDatabaseURL: порожньо');
    expect(report).toContain('firebaseAppIdAndroid: порожньо');
    expect(report).not.toContain(secretApiKey);
  });

  it('returns null from process.env when only the current platform app id is set', async () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'secret-key');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL', 'https://demo.firebaseio.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'demo');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID', '1:x:android:demo');
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    expect(describeFirebaseConfigGap()).toBeNull();
  });

  it('on ios requires only the ios app id', async () => {
    mockPlatform.OS = 'ios';
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'secret-key');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL', 'https://demo.firebaseio.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'demo');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_ID_IOS', '1:x:ios:demo');
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    expect(describeFirebaseConfigGap()).toBeNull();
  });
});

describe('loadFirebaseConfig', () => {
  beforeEach(() => {
    mockExtra.current = {};
    mockPlatform.OS = 'android';
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads platform app id from expo.extra on android', async () => {
    mockExtra.current = {
      firebaseApiKey: 'k',
      firebaseAuthDomain: 'demo.firebaseapp.com',
      firebaseDatabaseURL: 'https://demo.firebaseio.com',
      firebaseProjectId: 'demo',
      firebaseStorageBucket: 'demo.appspot.com',
      firebaseMessagingSenderId: '1',
      firebaseAppIdAndroid: '1:x:android:demo',
      firebaseAppIdIos: '',
    };
    const { loadFirebaseConfig } = await import('../lib/firebase/config.js');
    expect(loadFirebaseConfig().appId).toBe('1:x:android:demo');
  });

  it('loads platform app id from process.env on ios', async () => {
    mockPlatform.OS = 'ios';
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'k');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'demo.firebaseapp.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL', 'https://demo.firebaseio.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'demo');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'demo.appspot.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '1');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_ID_IOS', '1:x:ios:demo');
    const { loadFirebaseConfig } = await import('../lib/firebase/config.js');
    expect(loadFirebaseConfig().appId).toBe('1:x:ios:demo');
  });

  it('does not treat whitespace-only platform app id as configured', async () => {
    mockExtra.current = {
      firebaseApiKey: 'k',
      firebaseDatabaseURL: 'https://demo.firebaseio.com',
      firebaseProjectId: 'demo',
      firebaseAppIdAndroid: '   ',
    };
    const { isFirebaseConfigured, describeFirebaseConfigGap } =
      await import('../lib/firebase/config.js');
    expect(isFirebaseConfigured()).toBe(false);
    expect(describeFirebaseConfigGap()).toContain('firebaseAppIdAndroid: порожньо');
  });
});
