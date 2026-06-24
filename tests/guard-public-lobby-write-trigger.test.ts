import { describe, expect, it } from 'vitest';

import {
  resolvePublicLobbyWriteAction,
  validatePublicLobbyEntry,
} from '../functions/src/guard-public-lobby-write.js';

const ALLOWLIST = ['компютер', 'портрет'];
const NOW = 1_000_000;

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    baseWord: 'портрет',
    baseWordNorm: 'портрет',
    playerCount: 1,
    maxPlayers: 8,
    publishedAt: NOW,
    expiresAt: NOW + 300_000,
    ...overrides,
  };
}

describe('validatePublicLobbyEntry', () => {
  it('rejects baseWordNorm that does not match normalized baseWord', () => {
    expect(
      validatePublicLobbyEntry(
        validEntry({ baseWord: 'ПОРТРЕТ', baseWordNorm: 'портрет' }),
        ALLOWLIST,
        NOW,
      ),
    ).toEqual({ ok: true });
    expect(
      validatePublicLobbyEntry(
        validEntry({ baseWord: 'offensive', baseWordNorm: 'портрет' }),
        ALLOWLIST,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'BASE_WORD_NORM_MISMATCH' });
  });
});

describe('resolvePublicLobbyWriteAction', () => {
  it('increments when a new valid entry is written', () => {
    expect(resolvePublicLobbyWriteAction(null, validEntry(), ALLOWLIST, NOW)).toEqual({
      countDelta: 1,
      rejectAfter: false,
    });
  });

  it('does not increment invalid new entries and marks reject', () => {
    expect(
      resolvePublicLobbyWriteAction(null, validEntry({ baseWordNorm: 'няшка' }), ALLOWLIST, NOW),
    ).toEqual({
      countDelta: 0,
      rejectAfter: true,
    });
  });

  it('decrements when a valid entry is deleted', () => {
    expect(resolvePublicLobbyWriteAction(validEntry(), null, ALLOWLIST, NOW)).toEqual({
      countDelta: -1,
      rejectAfter: false,
    });
  });

  it('does not change count when a valid entry is updated', () => {
    expect(
      resolvePublicLobbyWriteAction(validEntry(), validEntry({ playerCount: 2 }), ALLOWLIST, NOW),
    ).toEqual({
      countDelta: 0,
      rejectAfter: false,
    });
  });

  it('decrements when a valid entry is replaced with invalid data', () => {
    expect(
      resolvePublicLobbyWriteAction(
        validEntry(),
        validEntry({ baseWordNorm: 'няшка' }),
        ALLOWLIST,
        NOW,
      ),
    ).toEqual({
      countDelta: -1,
      rejectAfter: true,
    });
  });
});
