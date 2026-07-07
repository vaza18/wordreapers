import { beforeEach, describe, expect, it, vi } from 'vitest';

const runTransactionMock = vi.fn();
const getMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));

import { runRtdbTransaction } from '../lib/firebase/rtdb-transaction.js';

describe('runRtdbTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns committed transaction results', async () => {
    const snapshot = { exists: () => true };
    runTransactionMock.mockResolvedValue({ committed: true, snapshot });

    await expect(runRtdbTransaction({} as never, () => null)).resolves.toEqual({
      committed: true,
      snapshot,
    });
  });

  it('treats ignorable transaction aborts as non-committed', async () => {
    runTransactionMock.mockRejectedValue(new Error('disconnect'));
    getMock.mockResolvedValue({ exists: () => false });

    const result = await runRtdbTransaction({} as never, () => null);

    expect(result.committed).toBe(false);
    expect(result.snapshot?.exists()).toBe(false);
  });

  it('rethrows non-ignorable errors', async () => {
    runTransactionMock.mockRejectedValue(new Error('network down'));

    await expect(runRtdbTransaction({} as never, () => null)).rejects.toThrow('network down');
  });
});
