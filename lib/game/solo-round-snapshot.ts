import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WordScoreBadge, WordScoreKind } from './scoring.js';
import type { LocalRoomSetup } from '../online/local-room-draft.js';

export const SOLO_ROUND_SNAPSHOT_KEY = 'wordreapers.soloRoundSnapshot';
export const SOLO_ROUND_SNAPSHOT_VERSION = 1 as const;

/** One accepted word stored inside a durable solo snapshot. */
export interface SoloRoundSnapshotWord {
  normalized: string;
  display: string;
  kind: WordScoreKind;
  points: number;
  badge: WordScoreBadge;
  at: number;
}

/** Durable paused training round for restore after process death. */
export interface SoloRoundSnapshotV1 {
  version: typeof SOLO_ROUND_SNAPSHOT_VERSION;
  draftId: string;
  setup: LocalRoomSetup;
  uniqueBonusEnabled: boolean;
  status: 'paused';
  pausedRemainingMs: number;
  roundTimerBudgetSeconds: number | null;
  roundPlayedSeconds: number | null;
  words: SoloRoundSnapshotWord[];
  published: boolean;
  savedAt: number;
}

/** In-memory solo fields needed to build a durable snapshot. */
export interface SoloRoundSnapshotSource {
  draftId: string;
  setup: LocalRoomSetup | null;
  uniqueBonusEnabled: boolean;
  status: 'idle' | 'playing' | 'paused' | 'finished';
  endsAt: number | null;
  pausedRemainingMs: number | null;
  roundTimerBudgetSeconds: number | null;
  roundPlayedSeconds: number | null;
  words: SoloRoundSnapshotWord[];
  published: boolean;
  now: number;
}

function isLocalRoomSetup(value: unknown): value is LocalRoomSetup {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.baseWord === 'string' &&
    typeof row.baseWordDisplay === 'string' &&
    typeof row.durationMinutes === 'number' &&
    (row.uniqueBonusMode === 'off' ||
      row.uniqueBonusMode === 'auto' ||
      row.uniqueBonusMode === 'on') &&
    typeof row.allowProperNouns === 'boolean' &&
    typeof row.allowSlang === 'boolean'
  );
}

function isSnapshotWord(value: unknown): value is SoloRoundSnapshotWord {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.normalized === 'string' &&
    typeof row.display === 'string' &&
    typeof row.kind === 'string' &&
    typeof row.points === 'number' &&
    (row.badge === null || typeof row.badge === 'string') &&
    typeof row.at === 'number'
  );
}

/** Validate unknown JSON into a solo snapshot, or null. */
export function parseSoloRoundSnapshot(raw: unknown): SoloRoundSnapshotV1 | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (row.version !== SOLO_ROUND_SNAPSHOT_VERSION) {
    return null;
  }
  if (typeof row.draftId !== 'string' || row.draftId.length === 0) {
    return null;
  }
  if (!isLocalRoomSetup(row.setup)) {
    return null;
  }
  if (typeof row.uniqueBonusEnabled !== 'boolean') {
    return null;
  }
  if (row.status !== 'paused') {
    return null;
  }
  if (typeof row.pausedRemainingMs !== 'number' || row.pausedRemainingMs < 0) {
    return null;
  }
  if (row.roundTimerBudgetSeconds != null && typeof row.roundTimerBudgetSeconds !== 'number') {
    return null;
  }
  if (row.roundPlayedSeconds != null && typeof row.roundPlayedSeconds !== 'number') {
    return null;
  }
  if (!Array.isArray(row.words) || !row.words.every(isSnapshotWord)) {
    return null;
  }
  if (typeof row.published !== 'boolean') {
    return null;
  }
  const savedAt = typeof row.savedAt === 'number' ? row.savedAt : 0;
  return {
    version: SOLO_ROUND_SNAPSHOT_VERSION,
    draftId: row.draftId,
    setup: row.setup,
    uniqueBonusEnabled: row.uniqueBonusEnabled,
    status: 'paused',
    pausedRemainingMs: row.pausedRemainingMs,
    roundTimerBudgetSeconds:
      typeof row.roundTimerBudgetSeconds === 'number' ? row.roundTimerBudgetSeconds : null,
    roundPlayedSeconds: typeof row.roundPlayedSeconds === 'number' ? row.roundPlayedSeconds : null,
    words: row.words,
    published: row.published,
    savedAt,
  };
}

/**
 * Build a durable paused snapshot from in-memory solo state.
 * Returns null when there is no active (playing/paused) round.
 */
export function buildSoloRoundSnapshot(
  source: SoloRoundSnapshotSource,
): SoloRoundSnapshotV1 | null {
  if (!source.setup || !source.draftId) {
    return null;
  }
  if (source.status !== 'playing' && source.status !== 'paused') {
    return null;
  }

  let pausedRemainingMs: number;
  if (source.status === 'paused' && source.pausedRemainingMs != null) {
    pausedRemainingMs = Math.max(0, source.pausedRemainingMs);
  } else if (source.status === 'playing' && source.endsAt != null) {
    pausedRemainingMs = Math.max(0, source.endsAt - source.now);
  } else {
    return null;
  }

  return {
    version: SOLO_ROUND_SNAPSHOT_VERSION,
    draftId: source.draftId,
    setup: source.setup,
    uniqueBonusEnabled: source.uniqueBonusEnabled,
    status: 'paused',
    pausedRemainingMs,
    roundTimerBudgetSeconds: source.roundTimerBudgetSeconds,
    roundPlayedSeconds: source.roundPlayedSeconds,
    words: source.words.map((word) => ({ ...word })),
    published: source.published,
    savedAt: source.now,
  };
}

/** Write a validated solo snapshot to AsyncStorage. */
export async function saveSoloRoundSnapshot(snapshot: SoloRoundSnapshotV1): Promise<void> {
  await AsyncStorage.setItem(SOLO_ROUND_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

/** Remove any persisted solo snapshot. */
export async function clearSoloRoundSnapshot(): Promise<void> {
  await AsyncStorage.removeItem(SOLO_ROUND_SNAPSHOT_KEY);
}

/** Load and validate the solo snapshot, clearing corrupt data. */
export async function loadSoloRoundSnapshot(): Promise<SoloRoundSnapshotV1 | null> {
  const raw = await AsyncStorage.getItem(SOLO_ROUND_SNAPSHOT_KEY);
  if (raw == null || raw === '') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    const snapshot = parseSoloRoundSnapshot(parsed);
    if (!snapshot) {
      await clearSoloRoundSnapshot();
      return null;
    }
    return snapshot;
  } catch {
    await clearSoloRoundSnapshot();
    return null;
  }
}

/** Persist current solo store fields when an active round exists. */
export async function persistSoloRoundSnapshotFromState(
  source: Omit<SoloRoundSnapshotSource, 'now'> & { now?: number },
): Promise<boolean> {
  const snapshot = buildSoloRoundSnapshot({ ...source, now: source.now ?? Date.now() });
  if (!snapshot) {
    return false;
  }
  await saveSoloRoundSnapshot(snapshot);
  return true;
}
