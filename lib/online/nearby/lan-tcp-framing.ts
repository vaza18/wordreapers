import { MAX_PEER_ARCHIVE_JSON_CHARS } from './strip-archive.js';
import { parseNearbyProtocolMessage, type NearbyProtocolMessage } from './protocol.js';

/**
 * Max characters for one TCP newline-delimited JSON frame.
 * Sized for a single archive message (+ small protocol envelope), not a multi-round batch.
 * Hosts must send one archive per `archives` line (see lan-transport Want handler).
 */
export const MAX_TCP_LINE_CHARS = MAX_PEER_ARCHIVE_JSON_CHARS + 8_000;

export function encodeNearbyTcpLine(message: NearbyProtocolMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function bytesToUtf8(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    return data;
  }
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(data);
  }
  let out = '';
  for (let i = 0; i < data.length; i += 1) {
    out += String.fromCharCode(data[i] ?? 0);
  }
  return out;
}

type TcpSocketLike = {
  write: (data: string, encoding?: string) => void;
  on: (event: string, cb: (...args: never[]) => void) => void;
  destroy: () => void;
};

/**
 * Newline-delimited JSON reader. Destroys the socket if buffer/line exceeds {@link MAX_TCP_LINE_CHARS}.
 */
export function attachNearbyTcpLineReader(
  socket: TcpSocketLike,
  onMessage: (msg: NearbyProtocolMessage) => void,
): void {
  let buffer = '';
  socket.on('data', (data: string | Uint8Array) => {
    buffer += bytesToUtf8(data);
    if (buffer.length > MAX_TCP_LINE_CHARS) {
      buffer = '';
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      return;
    }
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > MAX_TCP_LINE_CHARS) {
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        return;
      }
      if (line) {
        try {
          const parsed = parseNearbyProtocolMessage(JSON.parse(line) as unknown);
          if (parsed) {
            onMessage(parsed);
          }
        } catch {
          // ignore malformed line
        }
      }
      newline = buffer.indexOf('\n');
    }
  });
}
