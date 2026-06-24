import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PublicLobbyEntry {
  baseWord?: string;
  baseWordNorm?: string;
  playerCount?: number;
  maxPlayers?: number;
  publishedAt?: number;
  expiresAt?: number;
}

/** Strip apostrophes and normalize Ukrainian for allowlist lookup. */
export function normalizeUkForAllowlist(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[''ʼ`]/g, '');
}

export type PublicLobbyGuardFailure =
  | 'MISSING_FIELDS'
  | 'MAX_PLAYERS'
  | 'PLAYER_COUNT'
  | 'EXPIRED'
  | 'UNSAFE_BASE_WORD'
  | 'BASE_WORD_NORM_MISMATCH';

let cachedAllowlist: string[] | null = null;

/** Load sorted normalized base words bundled at deploy time. */
export function loadPublicBaseWordAllowlist(): string[] {
  if (cachedAllowlist) {
    return cachedAllowlist;
  }
  const filePath = path.join(__dirname, 'data', 'base_words.uk-uk.txt');
  const raw = fs.readFileSync(filePath, 'utf8');
  cachedAllowlist = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return cachedAllowlist;
}

/**
 * Binary search in sorted allowlist.
 */
export function isWordInAllowlist(normalized: string, allowlist: readonly string[]): boolean {
  if (!normalized) {
    return false;
  }
  let low = 0;
  let high = allowlist.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const word = allowlist[mid];
    if (!word) {
      break;
    }
    const cmp = normalized.localeCompare(word, 'uk');
    if (cmp === 0) {
      return true;
    }
    if (cmp > 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return false;
}

/**
 * Validate a public lobby index row before accepting the write.
 */
export function validatePublicLobbyEntry(
  entry: PublicLobbyEntry,
  allowlist: readonly string[],
  now: number,
): { ok: true } | { ok: false; reason: PublicLobbyGuardFailure } {
  if (
    typeof entry.baseWord !== 'string' ||
    !entry.baseWord ||
    typeof entry.baseWordNorm !== 'string' ||
    !entry.baseWordNorm ||
    typeof entry.playerCount !== 'number' ||
    typeof entry.maxPlayers !== 'number' ||
    typeof entry.publishedAt !== 'number' ||
    typeof entry.expiresAt !== 'number'
  ) {
    return { ok: false, reason: 'MISSING_FIELDS' };
  }
  if (entry.maxPlayers > 8) {
    return { ok: false, reason: 'MAX_PLAYERS' };
  }
  if (entry.playerCount < 0 || entry.playerCount > entry.maxPlayers) {
    return { ok: false, reason: 'PLAYER_COUNT' };
  }
  if (entry.expiresAt <= now) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (entry.baseWordNorm !== normalizeUkForAllowlist(entry.baseWord)) {
    return { ok: false, reason: 'BASE_WORD_NORM_MISMATCH' };
  }
  if (!isWordInAllowlist(entry.baseWordNorm, allowlist)) {
    return { ok: false, reason: 'UNSAFE_BASE_WORD' };
  }
  return { ok: true };
}

export type PublicLobbyCountDelta = -1 | 0 | 1;

export interface PublicLobbyWriteAction {
  countDelta: PublicLobbyCountDelta;
  /** Remove the index row (invalid write). */
  rejectAfter: boolean;
}

/** Whether entry passes full public lobby validation gate. */
function entryIsValid(
  entry: PublicLobbyEntry | null | undefined,
  allowlist: readonly string[],
  now: number,
): entry is PublicLobbyEntry {
  if (!entry) {
    return false;
  }
  return validatePublicLobbyEntry(entry, allowlist, now).ok;
}

/**
 * Pure count / reject decision for public lobby index writes (testable without RTDB).
 */
export function resolvePublicLobbyWriteAction(
  before: PublicLobbyEntry | null | undefined,
  after: PublicLobbyEntry | null | undefined,
  allowlist: readonly string[],
  now: number,
): PublicLobbyWriteAction {
  if (!after) {
    return {
      countDelta: entryIsValid(before, allowlist, now) ? -1 : 0,
      rejectAfter: false,
    };
  }

  if (!entryIsValid(after, allowlist, now)) {
    return {
      countDelta: entryIsValid(before, allowlist, now) ? -1 : 0,
      rejectAfter: true,
    };
  }

  if (!before) {
    return { countDelta: 1, rejectAfter: false };
  }

  return { countDelta: 0, rejectAfter: false };
}
