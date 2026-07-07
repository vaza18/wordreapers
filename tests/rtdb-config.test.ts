import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rtdb-config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses instance id from database URL', async () => {
    process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL =
      'https://slovozbyrachy-default-rtdb.europe-west1.firebasedatabase.app';
    const { rtdbInstanceId, RTDB_REGION } = await import('../functions/src/rtdb-config.js');

    expect(rtdbInstanceId()).toBe('slovozbyrachy-default-rtdb');
    expect(RTDB_REGION).toBe('europe-west1');
  });

  it('falls back to project id when database URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL;
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'demo-project';
    const { rtdbInstanceId } = await import('../functions/src/rtdb-config.js');

    expect(rtdbInstanceId()).toBe('demo-project-default-rtdb');
  });
});
