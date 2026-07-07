import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onValueMock = vi.fn();

vi.mock('firebase/database', () => ({
  onValue: (...args: unknown[]) => onValueMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

describe('server-clock', () => {
  beforeEach(() => {
    vi.resetModules();
    onValueMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('applies Firebase server time offset to getServerNow', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    onValueMock.mockImplementation((_ref, onNext) => {
      onNext({ val: () => 250 });
      return vi.fn();
    });

    const { getServerNow, startServerClockSync } = await import('../lib/firebase/server-clock.js');
    startServerClockSync();

    expect(getServerNow()).toBe(1_000_250);
    nowSpy.mockRestore();
  });

  it('reuses the same unsubscribe handle', async () => {
    const unsub = vi.fn();
    onValueMock.mockImplementation(() => unsub);

    const { startServerClockSync } = await import('../lib/firebase/server-clock.js');
    const first = startServerClockSync();
    const second = startServerClockSync();

    expect(first).toBe(second);
    expect(onValueMock).toHaveBeenCalledTimes(1);
  });
});
