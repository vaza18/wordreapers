import { describe, expect, it, vi } from 'vitest';

import {
  attachNearbyTcpLineReader,
  encodeNearbyTcpLine,
  MAX_TCP_LINE_CHARS,
} from '@/lib/online/nearby/lan-tcp-framing';
import { createArchivesEndMessage } from '@/lib/online/nearby/protocol';
import {
  isPeerArchiveWithinWireLimit,
  isValidPeerArchiveShape,
  MAX_PEER_ARCHIVE_JSON_CHARS,
  stripArchiveForTransfer,
} from '@/lib/online/nearby/strip-archive';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

function makeArchive(round: number, wordPad = 20): FinishedRoundArchive {
  const pad = 'z'.repeat(wordPad);
  return {
    gameId: 'K7X3P',
    baseWordRound: round,
    savedAt: 1000 + round,
    session: {
      baseWord: `слово${round}`,
      status: 'finished',
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: null,
      organizerId: 'a',
      players: {
        a: { name: 'A', wordCount: 2, score: 2, online: true },
        b: { name: 'B', wordCount: 2, score: 2, online: true },
      },
      liveRoundPlayerUids: ['a', 'b'],
      baseWordRound: round,
    },
    playerWords: {
      a: [`kit${pad}`, `lis${pad}`],
      b: [`dim${pad}`, `sad${pad}`],
    },
    playerWordCounts: { a: 2, b: 2 },
  };
}

function createMockSocket() {
  const dataHandlers: Array<(data: string) => void> = [];
  let destroyed = false;
  return {
    destroyed: () => destroyed,
    write: vi.fn(),
    destroy: () => {
      destroyed = true;
    },
    on: (event: string, cb: (...args: never[]) => void) => {
      if (event === 'data') {
        dataHandlers.push(cb as (data: string) => void);
      }
    },
    emitData: (chunk: string) => {
      for (const handler of dataHandlers) {
        handler(chunk);
      }
    },
  };
}

describe('nearby TCP framing (multi-archive)', () => {
  it('accepts three medium archives as separate lines without destroying', () => {
    const socket = createMockSocket();
    const received: unknown[] = [];
    let ended = false;
    attachNearbyTcpLineReader(socket, (message) => {
      if (message.type === 'archives') {
        received.push(...message.archives);
      }
      if (message.type === 'archivesEnd') {
        ended = true;
      }
    });

    const frames: string[] = [];
    for (const round of [0, 1, 2]) {
      // ~40k ASCII pad × 4 words ≈ ~160k/archive (under 400k); three in one legacy line > 408k.
      const stripped = stripArchiveForTransfer(makeArchive(round, 40_000));
      expect(isPeerArchiveWithinWireLimit(stripped)).toBe(true);
      const line = encodeNearbyTcpLine({
        type: 'archives',
        gameId: 'K7X3P',
        archives: [stripped],
      });
      expect(line.length).toBeLessThanOrEqual(MAX_TCP_LINE_CHARS);
      frames.push(line);
    }
    const legacyBatch = encodeNearbyTcpLine({
      type: 'archives',
      gameId: 'K7X3P',
      archives: frames.map((_, index) => stripArchiveForTransfer(makeArchive(index, 40_000))),
    });
    expect(legacyBatch.length).toBeGreaterThan(MAX_TCP_LINE_CHARS);

    for (const line of frames) {
      socket.emitData(line);
    }
    socket.emitData(encodeNearbyTcpLine(createArchivesEndMessage('K7X3P')));

    expect(socket.destroyed()).toBe(false);
    expect(received).toHaveLength(3);
    expect(ended).toBe(true);
  });

  it('destroys socket when a single line exceeds MAX_TCP_LINE_CHARS', () => {
    const socket = createMockSocket();
    attachNearbyTcpLineReader(socket, () => undefined);
    const oversized = `${'x'.repeat(MAX_TCP_LINE_CHARS + 1)}\n`;
    socket.emitData(oversized);
    expect(socket.destroyed()).toBe(true);
  });

  it('rejects oversized single archive shape', () => {
    const huge = makeArchive(0, 1);
    // Inflate playerWords past the wire cap without changing shape validity otherwise.
    huge.playerWords = {
      a: [JSON.stringify({ pad: 'z'.repeat(MAX_PEER_ARCHIVE_JSON_CHARS) })],
    };
    expect(isPeerArchiveWithinWireLimit(huge)).toBe(false);
    expect(isValidPeerArchiveShape(huge)).toBe(false);
  });
});
