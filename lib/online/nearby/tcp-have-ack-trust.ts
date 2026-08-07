/**
 * LAN host may mark HaveAck as TCP-trusted only after this socket accepted Want
 * from the same uid (UDP/TCP connect alone is spoofable via advertised port).
 */
export function shouldTrustTcpHaveAck(
  wantAcceptedUid: string | null | undefined,
  haveAckUid: string,
): boolean {
  return Boolean(wantAcceptedUid && haveAckUid && wantAcceptedUid === haveAckUid);
}
