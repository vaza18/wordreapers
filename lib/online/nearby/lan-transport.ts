import { Platform } from 'react-native';

import { normalizeRoomCode } from '../../firebase/room-code.js';
import { devLogAction } from '../../debug/dev-log.js';
import type { FinishedRoundArchive } from '../session/online-session-archive.js';

import {
  createArchivesEndMessage,
  createHaveAckMessage,
  createHelloMessage,
  createWantMessage,
  isAuthorizedNearbyRequester,
} from './protocol.js';
import type {
  NearbyArchiveTransport,
  NearbyFetchMissingInput,
  NearbyFetchMissingResult,
  NearbyHostHandlers,
} from './nearby-archive-transport.js';
import { isNearbyHostApplyTokenActive } from './nearby-archive-transport.js';
import {
  isPeerArchiveWithinWireLimit,
  isValidPeerArchiveShape,
  stripArchiveForTransfer,
} from './strip-archive.js';
import { shouldTrustTcpHaveAck } from './tcp-have-ack-trust.js';
import { clientHaveAckRoundsFromReceived, hostTrustedHaveAckRounds } from './have-ack-rounds.js';
import { createFetchMissingSettler } from './fetch-missing-settler.js';
import { normalizeHaveRounds } from './missing-round-archives.js';
import { sanitizeWantRounds } from './want-rounds.js';
import { attachNearbyTcpLineReader, bytesToUtf8, encodeNearbyTcpLine } from './lan-tcp-framing.js';
import {
  nearbyUdpAnnounceDestinationPort,
  nearbyUdpDiscoveryCreateSocketOptions,
  nearbyUdpDiscoveryListenPort,
  NEARBY_UDP_MAGIC,
} from './udp-discovery.js';

type UdpAnnounce = {
  magic: typeof NEARBY_UDP_MAGIC;
  kind: 'host' | 'haveAck';
  gameId: string;
  uid: string;
  port?: number;
  haveRounds: number[];
};

type TcpSocketLike = {
  write: (data: string, encoding?: string) => void;
  on: (event: string, cb: (...args: never[]) => void) => void;
  destroy: () => void;
};

type TcpServerLike = {
  listen: (opts: { port: number; host?: string }, cb?: () => void) => void;
  on: (event: string, cb: (...args: never[]) => void) => void;
  close: () => void;
  address: () => { port: number } | string | null;
};

type TcpModuleLike = {
  createServer: (connectionListener?: (socket: TcpSocketLike) => void) => TcpServerLike;
  createConnection: (
    options: { host?: string; port: number },
    connectionListener?: () => void,
  ) => TcpSocketLike;
};

function canUseNativeLan(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function loadTcp(): TcpModuleLike | null {
  try {
    // Package typings expose default export; runtime require is the API object.
    const mod = require('react-native-tcp-socket') as TcpModuleLike | { default: TcpModuleLike };
    if (mod && 'createServer' in mod && typeof mod.createServer === 'function') {
      return mod;
    }
    if (mod && 'default' in mod) {
      return mod.default;
    }
    return null;
  } catch {
    return null;
  }
}

function loadUdp(): {
  createSocket: (options: string | { type: string; reusePort?: boolean }) => UdpSocketLike;
} | null {
  try {
    return require('react-native-udp') as {
      createSocket: (options: string | { type: string; reusePort?: boolean }) => UdpSocketLike;
    };
  } catch {
    return null;
  }
}

type UdpSocketLike = {
  bind: (port: number) => void;
  setBroadcast: (enabled: boolean) => void;
  send: (
    msg: string,
    offset: number,
    length: number,
    port: number,
    address: string,
    cb?: (err?: Error) => void,
  ) => void;
  on: (event: string, cb: (...args: never[]) => void) => void;
  close: () => void;
  addMembership?: (address: string) => void;
};

/**
 * LAN nearby archive transport: UDP announce + TCP JSON lines.
 */
export function createLanNearbyTransport(): NearbyArchiveTransport {
  let hostHandlers: NearbyHostHandlers | null = null;
  let server: TcpServerLike | null = null;
  let udp: UdpSocketLike | null = null;
  let advertiseTimer: ReturnType<typeof setInterval> | null = null;
  let advertising = false;
  let listenPort = 0;
  const activeSockets = new Set<TcpSocketLike>();

  const stopAdvertiseTimer = () => {
    if (advertiseTimer) {
      clearInterval(advertiseTimer);
      advertiseTimer = null;
    }
  };

  const broadcastAnnounce = (announce: UdpAnnounce) => {
    if (!udp) {
      return;
    }
    const payload = JSON.stringify(announce);
    const destinations = ['255.255.255.255'];
    for (const address of destinations) {
      try {
        udp.send(payload, 0, payload.length, nearbyUdpAnnounceDestinationPort(), address);
      } catch {
        // ignore
      }
    }
  };

  const serveSocket = (socket: TcpSocketLike) => {
    activeSockets.add(socket);
    const handlers = hostHandlers;
    if (!handlers) {
      socket.destroy();
      return;
    }
    /** Set after authorized Want — required before trusting HaveAck on this socket. */
    let wantAcceptedUid: string | null = null;
    /** Rounds actually written on this socket after Want (trust cap for HaveAck). */
    let servedRoundsOnSocket: number[] = [];
    attachNearbyTcpLineReader(socket, (message) => {
      if (message.type === 'want') {
        if (
          !isAuthorizedNearbyRequester({
            messageGameId: message.gameId,
            messageUid: message.uid,
            sessionGameId: handlers.gameId,
            rosterUids: handlers.getRosterUids(),
          })
        ) {
          socket.destroy();
          return;
        }
        const wantRounds = sanitizeWantRounds(message.wantRounds);
        if (!wantRounds) {
          socket.destroy();
          return;
        }
        wantAcceptedUid = message.uid;
        void (async () => {
          try {
            const archives = await handlers.getArchivesForRounds(wantRounds);
            const servedRounds: number[] = [];
            const gameId = normalizeRoomCode(handlers.gameId);
            // One archive per TCP line — line limit is sized for a single archive envelope.
            for (const archive of archives) {
              const stripped = stripArchiveForTransfer(archive);
              if (!isPeerArchiveWithinWireLimit(stripped)) {
                continue;
              }
              const line = encodeNearbyTcpLine({
                type: 'archives',
                gameId,
                archives: [stripped],
              });
              socket.write(line);
              servedRounds.push(stripped.baseWordRound);
            }
            servedRoundsOnSocket = normalizeHaveRounds(servedRounds);
            socket.write(encodeNearbyTcpLine(createArchivesEndMessage(handlers.gameId)));
          } catch (error) {
            devLogAction('nearby lan want handler failed', {
              details: error instanceof Error ? error.message : String(error),
            });
            try {
              socket.destroy();
            } catch {
              // ignore
            }
          }
        })();
        return;
      }
      if (message.type === 'haveAck') {
        if (
          !isAuthorizedNearbyRequester({
            messageGameId: message.gameId,
            messageUid: message.uid,
            sessionGameId: handlers.gameId,
            rosterUids: handlers.getRosterUids(),
          })
        ) {
          return;
        }
        // Spoofed TCP HaveAck without Want must not stop lobby advertise.
        if (!shouldTrustTcpHaveAck(wantAcceptedUid, message.uid)) {
          return;
        }
        const trustedRounds = hostTrustedHaveAckRounds(message.haveRounds, servedRoundsOnSocket);
        if (trustedRounds.length === 0) {
          return;
        }
        handlers.onHaveAck?.(message.uid, trustedRounds, 'tcp');
      }
    });
    socket.on('close', () => {
      activeSockets.delete(socket);
    });
    socket.on('error', () => {
      activeSockets.delete(socket);
    });
    void (async () => {
      const haveRounds = await Promise.resolve(handlers.getHaveRounds());
      socket.write(
        encodeNearbyTcpLine(createHelloMessage(handlers.gameId, handlers.uid, haveRounds)),
      );
    })();
  };

  return {
    kind: 'lan',
    isAvailable() {
      return canUseNativeLan() && loadTcp() != null && loadUdp() != null;
    },
    async startHost(handlers) {
      if (!this.isAvailable()) {
        return;
      }
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      const TcpSocket = loadTcp();
      const dgram = loadUdp();
      if (!TcpSocket || !dgram) {
        return;
      }
      if (!server) {
        const myServer = TcpSocket.createServer((socket) => {
          serveSocket(socket);
        });
        server = myServer;
        await new Promise<void>((resolve) => {
          myServer.listen({ port: 0, host: '0.0.0.0' }, () => resolve());
        });
        if (!isNearbyHostApplyTokenActive(handlers)) {
          // Only tear down resources we still own — Gen2 may have replaced `server`.
          if (server === myServer) {
            try {
              myServer.close();
            } catch {
              // ignore
            }
            server = null;
            listenPort = 0;
          }
          return;
        }
        const addr = myServer.address();
        listenPort = typeof addr === 'object' && addr ? addr.port : 0;
      }
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      if (!udp) {
        const myUdp = dgram.createSocket(nearbyUdpDiscoveryCreateSocketOptions());
        udp = myUdp;
        try {
          myUdp.bind(nearbyUdpDiscoveryListenPort());
          myUdp.setBroadcast(true);
        } catch (error) {
          devLogAction('nearby lan udp bind failed', {
            details: error instanceof Error ? error.message : String(error),
          });
          if (udp === myUdp) {
            try {
              myUdp.close();
            } catch {
              // ignore
            }
            udp = null;
          }
          // Without discovery listen, peers cannot find this host — fail closed for *our* server only.
          if (server && !hostHandlers) {
            const orphanServer = server;
            try {
              orphanServer.close();
            } catch {
              // ignore
            }
            if (server === orphanServer) {
              server = null;
              listenPort = 0;
            }
          }
          return;
        }
        if (!isNearbyHostApplyTokenActive(handlers)) {
          if (udp === myUdp) {
            try {
              myUdp.close();
            } catch {
              // ignore
            }
            udp = null;
          }
          return;
        }
        myUdp.on('message', (msg: string | Uint8Array) => {
          try {
            const live = hostHandlers;
            if (!live) {
              return;
            }
            const text = bytesToUtf8(msg);
            const parsed = JSON.parse(text) as UdpAnnounce;
            if (parsed.magic !== NEARBY_UDP_MAGIC || parsed.kind !== 'haveAck') {
              return;
            }
            if (normalizeRoomCode(parsed.gameId) !== normalizeRoomCode(live.gameId)) {
              return;
            }
            if (
              !isAuthorizedNearbyRequester({
                messageGameId: parsed.gameId,
                messageUid: parsed.uid,
                sessionGameId: live.gameId,
                rosterUids: live.getRosterUids(),
              })
            ) {
              return;
            }
            live.onHaveAck?.(parsed.uid, parsed.haveRounds ?? [], 'udp');
          } catch {
            // ignore
          }
        });
      }
      if (!isNearbyHostApplyTokenActive(handlers)) {
        return;
      }
      hostHandlers = handlers;
      advertising = true;
      stopAdvertiseTimer();
      const tick = () => {
        if (!advertising || !hostHandlers) {
          return;
        }
        const live = hostHandlers;
        void (async () => {
          if (!advertising || hostHandlers !== live) {
            return;
          }
          const haveRounds = await Promise.resolve(live.getHaveRounds());
          if (!advertising || hostHandlers !== live) {
            return;
          }
          broadcastAnnounce({
            magic: NEARBY_UDP_MAGIC,
            kind: 'host',
            gameId: normalizeRoomCode(live.gameId),
            uid: live.uid,
            port: listenPort,
            haveRounds,
          });
        })();
      };
      tick();
      advertiseTimer = setInterval(tick, 2000);
    },
    async stopHost() {
      advertising = false;
      stopAdvertiseTimer();
      for (const socket of activeSockets) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
      activeSockets.clear();
      if (server) {
        try {
          server.close();
        } catch {
          // ignore
        }
        server = null;
      }
      if (udp) {
        try {
          udp.close();
        } catch {
          // ignore
        }
        udp = null;
      }
      hostHandlers = null;
      listenPort = 0;
    },
    async fetchMissing(input: NearbyFetchMissingInput): Promise<NearbyFetchMissingResult> {
      const empty: NearbyFetchMissingResult = {
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      };
      if (!this.isAvailable() || input.wantRounds.length === 0) {
        return empty;
      }
      const TcpSocket = loadTcp();
      const dgram = loadUdp();
      if (!TcpSocket || !dgram) {
        return empty;
      }

      const peerHaveRounds = new Map<string, number[]>();
      const archives: FinishedRoundArchive[] = [];
      let trustedWireCompleted = false;
      const remaining = new Set(input.wantRounds);
      const deadline = Date.now() + input.timeoutMs;

      type HostPeer = { uid: string; host: string; port: number; haveRounds: number[] };
      const discovered = new Map<string, HostPeer>();

      const scanSocket = dgram.createSocket(nearbyUdpDiscoveryCreateSocketOptions());
      try {
        // Must match host announce destination — bind(0) never receives those datagrams.
        scanSocket.bind(nearbyUdpDiscoveryListenPort());
        scanSocket.setBroadcast(true);
      } catch {
        try {
          scanSocket.close();
        } catch {
          // ignore
        }
        return empty;
      }

      await new Promise<void>((resolve) => {
        const settler = createFetchMissingSettler({
          deadlineMs: deadline,
          onFinish: () => resolve(),
        });

        const onMessage = (msg: string | Uint8Array, rinfo: { address: string }) => {
          if (settler.isSettled()) {
            return;
          }
          try {
            const text = bytesToUtf8(msg);
            const parsed = JSON.parse(text) as UdpAnnounce;
            if (parsed.magic !== NEARBY_UDP_MAGIC || parsed.kind !== 'host') {
              return;
            }
            if (normalizeRoomCode(parsed.gameId) !== normalizeRoomCode(input.gameId)) {
              return;
            }
            if (!parsed.port || !parsed.uid || parsed.uid === input.selfUid) {
              return;
            }
            discovered.set(parsed.uid, {
              uid: parsed.uid,
              host: rinfo.address,
              port: parsed.port,
              haveRounds: parsed.haveRounds ?? [],
            });
            input.onPeerHello?.(parsed.uid, parsed.haveRounds ?? []);
            peerHaveRounds.set(parsed.uid, parsed.haveRounds ?? []);
          } catch {
            // ignore
          }
        };
        scanSocket.on('message', onMessage);

        const probe = setInterval(() => {
          settler.onProbeTick();
          if (settler.isSettled()) {
            clearInterval(probe);
          }
        }, 200);

        // Prefer waiting a bit for announces, then fetch in candidate order
        setTimeout(
          () => {
            if (settler.isSettled()) {
              return;
            }
            settler.markFetchStarted();
            void (async () => {
              try {
                const order = [
                  ...input.candidateUids.filter((uid) => discovered.has(uid)),
                  ...[...discovered.keys()].filter((uid) => !input.candidateUids.includes(uid)),
                ];
                for (const uid of order) {
                  // Contact every host for completion HaveAck — do not stop when gaps fill.
                  if (settler.shouldAbort()) {
                    break;
                  }
                  const peer = discovered.get(uid);
                  if (!peer) {
                    continue;
                  }
                  const want = sanitizeWantRounds(input.wantRounds);
                  if (!want) {
                    break;
                  }
                  try {
                    const got = await fetchFromTcpPeer({
                      TcpSocket,
                      peer,
                      gameId: input.gameId,
                      selfUid: input.selfUid,
                      wantRounds: want,
                      timeoutMs: Math.max(500, deadline - Date.now()),
                    });
                    if (settler.isSettled()) {
                      break;
                    }
                    for (const [peerUid, rounds] of got.peerHaveRounds) {
                      peerHaveRounds.set(peerUid, rounds);
                    }
                    if (got.trustedWireCompleted) {
                      trustedWireCompleted = true;
                    }
                    for (const archive of got.archives) {
                      if (!remaining.has(archive.baseWordRound)) {
                        // still accept duplicate rounds for HaveAck path; dedupe in list
                      }
                      archives.push(archive);
                      remaining.delete(archive.baseWordRound);
                    }
                  } catch {
                    // try next peer
                  }
                }
              } finally {
                clearInterval(probe);
                settler.finish();
              }
            })();
          },
          Math.min(2500, Math.max(400, input.timeoutMs / 4)),
        );
      });

      try {
        scanSocket.close();
      } catch {
        // ignore
      }

      return { archives, peerHaveRounds, trustedWireCompleted };
    },
    async announceHaveAck(gameId, uid, haveRounds) {
      if (!this.isAvailable()) {
        return;
      }
      const dgram = loadUdp();
      if (!dgram) {
        return;
      }
      // Send-only: ephemeral bind is fine; datagrams still target discovery listen port.
      const socket = dgram.createSocket(nearbyUdpDiscoveryCreateSocketOptions());
      try {
        socket.bind(0);
        socket.setBroadcast(true);
        const payload = JSON.stringify({
          magic: NEARBY_UDP_MAGIC,
          kind: 'haveAck',
          gameId: normalizeRoomCode(gameId),
          uid,
          haveRounds: [...haveRounds],
        } satisfies UdpAnnounce);
        socket.send(
          payload,
          0,
          payload.length,
          nearbyUdpAnnounceDestinationPort(),
          '255.255.255.255',
        );
      } catch {
        // ignore
      } finally {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    },
  };
}

async function fetchFromTcpPeer(input: {
  TcpSocket: NonNullable<ReturnType<typeof loadTcp>>;
  peer: { host: string; port: number; uid: string };
  gameId: string;
  selfUid: string;
  wantRounds: readonly number[];
  timeoutMs: number;
}): Promise<NearbyFetchMissingResult> {
  const { TcpSocket, peer, gameId, selfUid, wantRounds, timeoutMs } = input;
  const peerHaveRounds = new Map<string, number[]>();
  const archives: FinishedRoundArchive[] = [];
  let trustedWireCompleted = false;

  await new Promise<void>((resolve, reject) => {
    const socket = TcpSocket.createConnection({ host: peer.host, port: peer.port }, () => {
      socket.write(encodeNearbyTcpLine(createWantMessage(gameId, selfUid, wantRounds)));
    });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve();
    }, timeoutMs);

    attachNearbyTcpLineReader(socket, (message) => {
      if (message.type === 'hello') {
        peerHaveRounds.set(message.uid, message.haveRounds);
        return;
      }
      if (message.type === 'archives') {
        for (const raw of message.archives) {
          if (isValidPeerArchiveShape(raw)) {
            archives.push(stripArchiveForTransfer(raw));
          }
        }
        return;
      }
      if (message.type === 'archivesEnd') {
        const ackRounds = clientHaveAckRoundsFromReceived(archives);
        socket.write(encodeNearbyTcpLine(createHaveAckMessage(gameId, selfUid, ackRounds)));
        if (ackRounds.length > 0) {
          trustedWireCompleted = true;
        }
        clearTimeout(timer);
        socket.destroy();
        resolve();
      }
    });
    socket.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });

  return { archives, peerHaveRounds, trustedWireCompleted };
}
