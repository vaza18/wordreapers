import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryFetchSessionWordMaps } from '@/lib/firebase/session-word-maps-service';
import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { get, type DataSnapshot } from 'firebase/database';

vi.mock('firebase/database', async () => {
  const actual = await vi.importActual('firebase/database');
  return {
    ...actual,
    get: vi.fn(),
    ref: vi.fn(),
  };
});

vi.mock('@/lib/firebase/init', () => ({
  getFirebaseDatabase: vi.fn(),
}));

vi.mock('@/lib/firebase/auth', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'test-uid' }),
}));

vi.mock('@/modules/native-traffic-stats', () => ({
  getAppTrafficBytes: vi.fn(() => ({ rxBytes: 0, txBytes: 0 })),
}));

describe('SessionWordMaps Instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });
    rtdbTrafficProbe.reset();
  });

  it('tryFetchSessionWordMaps records download traffic', async () => {
    const mockData = {
      word1: { uid1: true },
    };
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => mockData,
    } as unknown as DataSnapshot);

    const spy = vi.spyOn(rtdbTrafficProbe, 'record');

    const result = await tryFetchSessionWordMaps('TEST');

    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith('down', expect.any(Number));
  });
});
