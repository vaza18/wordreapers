/**
 * Who may commit wall-clock vote/timer expiry without N×1s full-session polls.
 * Primary (lexicographically smallest online live-round uid) fires at expiresAt;
 * other candidates fire after a short failover grace if the vote/status is still open.
 */

export const EXPIRY_RESOLVER_FAILOVER_GRACE_MS = 1500;

type PresencePlayer = {
  online?: boolean;
  hasLeft?: boolean;
};

/** Online, non-left players eligible to commit expiry (prefer live-round roster). */
export function onlineExpiryResolverCandidateUids(
  players: Record<string, PresencePlayer | undefined>,
  liveRoundPlayerUids: readonly string[] | null | undefined,
): string[] {
  const preferLive = Array.isArray(liveRoundPlayerUids) && liveRoundPlayerUids.length > 0;
  const pool: readonly string[] = preferLive
    ? (liveRoundPlayerUids as readonly string[])
    : Object.keys(players);
  const out: string[] = [];
  for (const uid of pool) {
    const player = players[uid];
    if (!player || player.online !== true || player.hasLeft === true) {
      continue;
    }
    out.push(uid);
  }
  out.sort();
  return out;
}

export function primaryExpiryResolverUid(candidateUids: readonly string[]): string | null {
  if (candidateUids.length === 0) {
    return null;
  }
  return [...candidateUids].sort()[0] ?? null;
}

export function voteExpiresAtFromProposed(proposedAt: number, timeoutMs: number): number {
  return proposedAt + timeoutMs;
}

export function earliestVoteExpiresAt(
  votes: ReadonlyArray<{ proposedAt?: number } | null | undefined>,
  timeoutMs: number,
): number | null {
  let min: number | null = null;
  for (const vote of votes) {
    const proposedAt = vote?.proposedAt ?? 0;
    if (proposedAt <= 0) {
      continue;
    }
    const at = voteExpiresAtFromProposed(proposedAt, timeoutMs);
    if (min === null || at < min) {
      min = at;
    }
  }
  return min;
}

export function msUntil(target: number, now: number): number {
  return Math.max(0, target - now);
}

/** Wall-clock when this client should attempt a network expiry resolve. */
export function nextExpiryNetworkWakeAt(options: {
  myUid: string;
  candidateUids: readonly string[];
  expiresAt: number;
  failoverGraceMs?: number;
}): number {
  const grace = options.failoverGraceMs ?? EXPIRY_RESOLVER_FAILOVER_GRACE_MS;
  const primary = primaryExpiryResolverUid(options.candidateUids);
  if (primary === null || options.myUid === primary) {
    return options.expiresAt;
  }
  return options.expiresAt + grace;
}

/** Whether this client may hit RTDB for expiry at `now` (local gate before get/tx). */
export function shouldAttemptExpiryNetworkResolve(options: {
  myUid: string;
  candidateUids: readonly string[];
  now: number;
  expiresAt: number;
  failoverGraceMs?: number;
}): boolean {
  if (options.now < options.expiresAt) {
    return false;
  }
  const wakeAt = nextExpiryNetworkWakeAt({
    myUid: options.myUid,
    candidateUids: options.candidateUids,
    expiresAt: options.expiresAt,
    failoverGraceMs: options.failoverGraceMs,
  });
  return options.now >= wakeAt;
}
