import { describe, expect, it } from 'vitest';

import { EARLY_FINISH_VOTE_TIMEOUT_MS } from '@/lib/online/voting/early-finish-vote';
import {
  EXPIRY_RESOLVER_FAILOVER_GRACE_MS,
  earliestVoteExpiresAt,
  msUntil,
  nextExpiryNetworkWakeAt,
  onlineExpiryResolverCandidateUids,
  primaryExpiryResolverUid,
  shouldAttemptExpiryNetworkResolve,
  voteExpiresAtFromProposed,
} from '@/lib/online/voting/expiry-resolver-role';

describe('onlineExpiryResolverCandidateUids', () => {
  it('prefers online live-round players', () => {
    const players = {
      b: { online: true },
      a: { online: true },
      c: { online: false },
      d: { online: true, hasLeft: true },
    };
    expect(onlineExpiryResolverCandidateUids(players, ['a', 'c', 'd'])).toEqual(['a']);
  });

  it('falls back to all online non-left when live list empty', () => {
    const players = {
      z: { online: true },
      m: { online: true },
      x: { online: false },
    };
    expect(onlineExpiryResolverCandidateUids(players, [])).toEqual(['m', 'z']);
    expect(onlineExpiryResolverCandidateUids(players, null)).toEqual(['m', 'z']);
  });
});

describe('primaryExpiryResolverUid', () => {
  it('picks lexicographically smallest uid', () => {
    expect(primaryExpiryResolverUid(['uid_b', 'uid_a'])).toBe('uid_a');
  });

  it('returns null for empty list', () => {
    expect(primaryExpiryResolverUid([])).toBeNull();
  });
});

describe('nextExpiryNetworkWakeAt', () => {
  const expiresAt = 10_000;
  const candidates = ['uid_a', 'uid_b'];

  it('primary wakes at expiresAt', () => {
    expect(
      nextExpiryNetworkWakeAt({
        myUid: 'uid_a',
        candidateUids: candidates,
        expiresAt,
      }),
    ).toBe(expiresAt);
  });

  it('non-primary wakes at expiresAt + grace', () => {
    expect(
      nextExpiryNetworkWakeAt({
        myUid: 'uid_b',
        candidateUids: candidates,
        expiresAt,
      }),
    ).toBe(expiresAt + EXPIRY_RESOLVER_FAILOVER_GRACE_MS);
  });

  it('when no candidates, any viewer wakes at expiresAt (legacy any-client fallback)', () => {
    expect(
      nextExpiryNetworkWakeAt({
        myUid: 'solo',
        candidateUids: [],
        expiresAt,
      }),
    ).toBe(expiresAt);
  });
});

describe('shouldAttemptExpiryNetworkResolve', () => {
  const expiresAt = 10_000;
  const candidates = ['uid_a', 'uid_b'];

  it('is false before expiresAt for everyone', () => {
    expect(
      shouldAttemptExpiryNetworkResolve({
        myUid: 'uid_a',
        candidateUids: candidates,
        now: expiresAt - 1,
        expiresAt,
      }),
    ).toBe(false);
    expect(
      shouldAttemptExpiryNetworkResolve({
        myUid: 'uid_b',
        candidateUids: candidates,
        now: expiresAt - 1,
        expiresAt,
      }),
    ).toBe(false);
  });

  it('primary may resolve at expiresAt; failover waits grace', () => {
    expect(
      shouldAttemptExpiryNetworkResolve({
        myUid: 'uid_a',
        candidateUids: candidates,
        now: expiresAt,
        expiresAt,
      }),
    ).toBe(true);
    expect(
      shouldAttemptExpiryNetworkResolve({
        myUid: 'uid_b',
        candidateUids: candidates,
        now: expiresAt,
        expiresAt,
      }),
    ).toBe(false);
    expect(
      shouldAttemptExpiryNetworkResolve({
        myUid: 'uid_b',
        candidateUids: candidates,
        now: expiresAt + EXPIRY_RESOLVER_FAILOVER_GRACE_MS,
        expiresAt,
      }),
    ).toBe(true);
  });
});

describe('vote timing helpers', () => {
  it('voteExpiresAtFromProposed adds timeout', () => {
    expect(voteExpiresAtFromProposed(1000, EARLY_FINISH_VOTE_TIMEOUT_MS)).toBe(
      1000 + EARLY_FINISH_VOTE_TIMEOUT_MS,
    );
  });

  it('earliestVoteExpiresAt picks min among votes with proposedAt', () => {
    expect(
      earliestVoteExpiresAt(
        [{ proposedAt: 5000 }, { proposedAt: 2000 }, { proposedAt: undefined }],
        30_000,
      ),
    ).toBe(32_000);
    expect(earliestVoteExpiresAt([], 30_000)).toBeNull();
  });

  it('msUntil never returns negative', () => {
    expect(msUntil(100, 150)).toBe(0);
    expect(msUntil(200, 150)).toBe(50);
  });
});
