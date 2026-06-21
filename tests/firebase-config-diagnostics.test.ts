import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExtra = vi.hoisted(() => ({ current: {} as Record<string, string | undefined> }));

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: mockExtra.current };
    },
  },
}));

describe('describeFirebaseConfigGap', () => {
  beforeEach(() => {
    mockExtra.current = {};
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when firebase config resolves', async () => {
    mockExtra.current = {
      firebaseApiKey: 'abc',
      firebaseDatabaseURL: 'https://example.firebaseio.com',
      firebaseProjectId: 'demo',
    };
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    expect(describeFirebaseConfigGap()).toBeNull();
  });

  it('lists missing extra and env keys without exposing values', async () => {
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    const report = describeFirebaseConfigGap();
    expect(report).toContain('[α] Firebase config');
    expect(report).toContain('firebaseApiKey: порожньо');
    expect(report).toContain('EXPO_PUBLIC_FIREBASE_API_KEY');
    expect(report).toContain('resolve(): немає');
    expect(report).not.toContain('abc');
  });

  it('reports env presence by length only', async () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_API_KEY', 'secret-key');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL', 'https://demo.firebaseio.com');
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'demo');
    const { describeFirebaseConfigGap } = await import('../lib/firebase/config.js');
    expect(describeFirebaseConfigGap()).toBeNull();
  });
});
