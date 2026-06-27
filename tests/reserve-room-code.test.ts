import { describe, expect, it, vi, beforeEach } from 'vitest';

const getMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

import { reserveUniqueRoomCode } from '../lib/firebase/reserve-room-code.js';

describe('reserveUniqueRoomCode', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('reuses preferred code when slot is empty', async () => {
    getMock.mockResolvedValueOnce({ exists: () => false });
    await expect(reserveUniqueRoomCode('ABCD', 'org-1')).resolves.toBe('ABCD');
  });

  it('reuses preferred code when same organizer already owns it', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ organizerId: 'org-1' }),
    });
    await expect(reserveUniqueRoomCode('ABCD', 'org-1')).resolves.toBe('ABCD');
  });

  it('allocates a new code when another organizer owns preferred code', async () => {
    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ organizerId: 'other' }),
      })
      .mockResolvedValueOnce({ exists: () => false });
    const code = await reserveUniqueRoomCode('ABCD', 'org-1');
    expect(code).not.toBe('ABCD');
    expect(code).toHaveLength(5);
  });
});
