import type { FinishedRoundArchive } from '../session/online-session-archive.js';

export type NearbyHostHandlers = {
  gameId: string;
  uid: string;
  /** Rounds this host can serve (sync or live async disk read). */
  getHaveRounds: () => number[] | Promise<number[]>;
  /** Load stripped archives for requested rounds (only those hosted locally). */
  getArchivesForRounds: (rounds: readonly number[]) => Promise<FinishedRoundArchive[]>;
  /** Uids currently allowed to request (session roster). */
  getRosterUids: () => ReadonlySet<string> | readonly string[];
  /**
   * HaveAck from a peer.
   * `tcp` / `ble` are trusted (after Want ∩ served); `udp` is informational only.
   */
  onHaveAck?: (uid: string, haveRounds: readonly number[], source: 'tcp' | 'udp' | 'ble') => void;
  /**
   * Coordinator token: invalidated on stopHost / newer claim.
   * Transports must not commit handlers or leave advertise when inactive.
   */
  applyToken?: { readonly active: boolean };
  /**
   * Lobby/join may probe BLE while capability is still unconfirmed (iOS os-pending).
   * Play / playQr must leave this unset so munim is not touched mid-round.
   */
  allowBleProbe?: boolean;
};

/** True when handlers may still be applied (no token ⇒ always active for tests). */
export function isNearbyHostApplyTokenActive(handlers: NearbyHostHandlers): boolean {
  return handlers.applyToken?.active !== false;
}

export type NearbyFetchMissingInput = {
  gameId: string;
  selfUid: string;
  /** Prefer contacting these uids in order when discovered. */
  candidateUids: readonly string[];
  wantRounds: readonly number[];
  /** Wall-clock budget hint (LAN + BLE phases use dedicated budgets when set). */
  timeoutMs: number;
  /** LAN phase budget (defaults to timeoutMs when unset). */
  lanTimeoutMs?: number;
  /** BLE GATT phase budget after LAN (0 skips BLE). */
  bleTimeoutMs?: number;
  /**
   * Local history gaps still needed as bytes (subset of wantRounds).
   * Hybrid enters BLE for gap-fill when these remain after LAN, or for
   * completion HaveAck when {@link seekCompletionAck} and LAN did not
   * set trustedWireCompleted. Defaults to wantRounds when omitted.
   */
  byteGapRounds?: readonly number[];
  /**
   * When true, BLE may run after LAN solely to finish trusted HaveAck
   * (local history already complete). Ignored when LAN already set
   * trustedWireCompleted.
   */
  seekCompletionAck?: boolean;
  onPeerHello?: (uid: string, haveRounds: readonly number[]) => void;
  /**
   * Hybrid re-checks before BLE phase so play(false) can suppress an in-flight
   * join/browse probe after LAN started (bleTimeoutMs may already be > 0).
   */
  isBlePhaseStillAllowed?: () => boolean;
};

export type NearbyFetchMissingResult = {
  archives: FinishedRoundArchive[];
  /** Peers that sent HaveAck / Hello during the fetch. */
  peerHaveRounds: Map<string, number[]>;
  /**
   * True when ≥1 TCP/BLE session reached archivesEnd and the client wrote a
   * non-empty HaveAck (trusted advertise-stop path). UDP Hello / partial
   * archives without End must stay false.
   */
  trustedWireCompleted: boolean;
};

/**
 * Nearby archive transport (LAN and/or BLE; memory for tests).
 */
export interface NearbyArchiveTransport {
  readonly kind: 'lan' | 'ble' | 'hybrid' | 'noop' | 'memory';
  isAvailable(): boolean;
  startHost(handlers: NearbyHostHandlers): Promise<void>;
  /** Abort everything including in-flight. */
  stopHost(): Promise<void>;
  fetchMissing(input: NearbyFetchMissingInput): Promise<NearbyFetchMissingResult>;
  /** Optional: broadcast HaveAck so lobby hosts can stop advertising. */
  announceHaveAck?(gameId: string, uid: string, haveRounds: readonly number[]): Promise<void>;
}
