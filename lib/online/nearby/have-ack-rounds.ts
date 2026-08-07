import { normalizeHaveRounds } from './missing-round-archives.js';

/**
 * Client HaveAck may only list rounds actually accepted from a shape-valid archives payload.
 * Never echo wantRounds "on faith".
 */
export function clientHaveAckRoundsFromReceived(
  receivedArchives: readonly { baseWordRound: number }[],
): number[] {
  return normalizeHaveRounds(receivedArchives.map((archive) => archive.baseWordRound));
}

/**
 * Host trusts only claimed HaveAck rounds that were actually served on this TCP socket.
 * Limits partial-ack early advertise stop; residual roster-uid spoof on hostile LAN is ADR threat model.
 */
export function hostTrustedHaveAckRounds(
  claimedHaveRounds: readonly number[],
  servedRoundsOnSocket: readonly number[],
): number[] {
  const served = new Set(
    servedRoundsOnSocket.filter((round) => Number.isFinite(round) && round >= 0).map(Math.floor),
  );
  return normalizeHaveRounds(claimedHaveRounds.filter((round) => served.has(Math.floor(round))));
}
