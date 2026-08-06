import { describe, expect, it } from 'vitest';

import { MAX_ROUNDS_PER_ROOM } from '@/constants/max-rounds-per-room';
import { expectedPriorRounds } from '@/lib/online/nearby/missing-round-archives';
import { sanitizeWantRounds } from '@/lib/online/nearby/want-rounds';

describe('MAX_ROUNDS_PER_ROOM nearby Want cap', () => {
  it('exports product room cap of 12', () => {
    expect(MAX_ROUNDS_PER_ROOM).toBe(12);
  });

  it('Want covers 0..N-1 capped at MAX_ROUNDS_PER_ROOM', () => {
    expect(expectedPriorRounds(0)).toEqual([]);
    expect(expectedPriorRounds(3)).toEqual([0, 1, 2]);
    expect(expectedPriorRounds(MAX_ROUNDS_PER_ROOM)).toEqual(
      Array.from({ length: MAX_ROUNDS_PER_ROOM }, (_, i) => i),
    );
    expect(expectedPriorRounds(MAX_ROUNDS_PER_ROOM + 5)).toEqual(
      Array.from({ length: MAX_ROUNDS_PER_ROOM }, (_, i) => i),
    );
  });

  it('sanitize rejects oversized or out-of-range Want', () => {
    expect(sanitizeWantRounds([0, 1])).toEqual([0, 1]);
    expect(sanitizeWantRounds([MAX_ROUNDS_PER_ROOM])).toBeNull();
    expect(
      sanitizeWantRounds(Array.from({ length: MAX_ROUNDS_PER_ROOM + 1 }, (_, i) => i)),
    ).toBeNull();
  });

  it('N>MAX: capped HaveAck stops lobby advertise (I1)', async () => {
    const { haveRoundsCompleteForN, missingRoundArchives } =
      await import('@/lib/online/nearby/missing-round-archives');
    const { PeerHaveRoundsMap } = await import('@/lib/online/nearby/peer-have-rounds');
    const { shouldAdvertiseForLobbyRoster } =
      await import('@/lib/online/nearby/should-advertise-lobby');

    const n = MAX_ROUNDS_PER_ROOM + 3;
    const capped = Array.from({ length: MAX_ROUNDS_PER_ROOM }, (_, i) => i);
    expect(expectedPriorRounds(n)).toEqual(capped);
    expect(
      missingRoundArchives(
        n,
        capped.map((r) => ({ baseWordRound: r })),
      ),
    ).toEqual([]);
    expect(haveRoundsCompleteForN(n, capped)).toBe(true);

    const peerHave = new PeerHaveRoundsMap();
    const gameId = 'LONG1';
    peerHave.setHaveRounds(gameId, 'joiner', capped, 'trusted');
    expect(
      shouldAdvertiseForLobbyRoster({
        baseWordRound: n,
        selfUid: 'host',
        onlineUids: ['host', 'joiner'],
        localPriorArchiveCount: MAX_ROUNDS_PER_ROOM,
        peerHave,
        gameId,
      }),
    ).toBe(false);
  });
});
