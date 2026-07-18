import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveFirebaseAppId } from '../lib/firebase/app-ids.js';

const ANDROID_ID = '1:x:android:demo';
const IOS_ID = '1:x:ios:demo';

describe('resolveFirebaseAppId', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('selects android app id on android', () => {
    expect(
      resolveFirebaseAppId({
        platform: 'android',
        androidAppId: ANDROID_ID,
        iosAppId: IOS_ID,
      }),
    ).toBe(ANDROID_ID);
  });

  it('selects ios app id on ios', () => {
    expect(
      resolveFirebaseAppId({
        platform: 'ios',
        androidAppId: ANDROID_ID,
        iosAppId: IOS_ID,
      }),
    ).toBe(IOS_ID);
  });

  it('reads platform ids from process.env when options omit them', () => {
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID', ANDROID_ID);
    vi.stubEnv('EXPO_PUBLIC_FIREBASE_APP_ID_IOS', IOS_ID);

    expect(resolveFirebaseAppId({ platform: 'android' })).toBe(ANDROID_ID);
    expect(resolveFirebaseAppId({ platform: 'ios' })).toBe(IOS_ID);
  });

  it('prefers explicit platform overrides', () => {
    expect(
      resolveFirebaseAppId({
        platform: 'android',
        androidAppId: '1:x:android:custom',
        iosAppId: IOS_ID,
      }),
    ).toBe('1:x:android:custom');
  });

  it('throws on unsupported platforms such as web', () => {
    expect(() =>
      resolveFirebaseAppId({
        platform: 'web',
        androidAppId: ANDROID_ID,
        iosAppId: IOS_ID,
      }),
    ).toThrow(/Unsupported Firebase platform "web"/);
  });

  it('throws when the platform app id is missing', () => {
    expect(() =>
      resolveFirebaseAppId({
        platform: 'android',
        iosAppId: IOS_ID,
      }),
    ).toThrow(/EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID/);

    expect(() =>
      resolveFirebaseAppId({
        platform: 'ios',
        androidAppId: ANDROID_ID,
      }),
    ).toThrow(/EXPO_PUBLIC_FIREBASE_APP_ID_IOS/);
  });
});
