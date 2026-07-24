import { useProfileStore } from '@/store/profile-store';

/** Verbosity for client Metro logs. Production builds always resolve to `none`. */
export type DevLogLevel = 'none' | 'error' | 'event' | 'detail' | 'all';

const LEVEL_RANK: Record<DevLogLevel, number> = {
  none: 0,
  error: 1,
  event: 2,
  detail: 3,
  all: 4,
};

const VALID_LEVELS = new Set<string>(Object.keys(LEVEL_RANK));

/** Parse a raw env string into a `DevLogLevel`, or null if invalid. */
export function parseDevLogLevel(raw: string | null | undefined): DevLogLevel | null {
  if (raw == null) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (!VALID_LEVELS.has(normalized)) {
    return null;
  }
  return normalized as DevLogLevel;
}

function readEnvLogLevel(): string | undefined {
  if (typeof process === 'undefined' || process.env == null) {
    return undefined;
  }
  return process.env.EXPO_PUBLIC_LOG_LEVEL;
}

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/**
 * Effective log level. Outside `__DEV__` always `none`.
 * In dev: env value when valid; empty/invalid → `event`.
 */
export function getDevLogLevel(): DevLogLevel {
  if (!isDevBuild()) {
    return 'none';
  }
  const parsed = parseDevLogLevel(readEnvLogLevel());
  return parsed ?? 'event';
}

/** Whether the current effective level is at least `minLevel`. */
export function isDevLogEnabled(minLevel: DevLogLevel): boolean {
  const current = getDevLogLevel();
  return LEVEL_RANK[current] >= LEVEL_RANK[minLevel];
}

/** Local wall-clock timestamp: `YYYY-MM-DD HH:mm:ss.SSS`. */
export function formatDevLogTimestamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms}`;
}

/** Resolve the actor label from an explicit name or the local profile store. */
export function resolveLocalActorLabel(explicit?: string | null): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }
  try {
    const name = useProfileStore.getState().name?.trim();
    if (name) {
      return name;
    }
  } catch {
    // Profile store may be unavailable in pure unit tests.
  }
  return 'unknown';
}

/** Format a full Metro log line with timestamp and actor. */
export function formatDevLogLine(actor: string, message: string, date?: Date): string {
  return `[${formatDevLogTimestamp(date)}] [${actor}] ${message}`;
}

/** Build ` (ROOM, round N)` suffix when room and/or round are known. */
export function formatRoomRoundSuffix(room?: string | null, round?: number | null): string {
  const parts: string[] = [];
  if (room != null && room.trim().length > 0) {
    parts.push(room.trim());
  }
  if (round != null && Number.isFinite(round)) {
    parts.push(`round ${round}`);
  }
  if (parts.length === 0) {
    return '';
  }
  return ` (${parts.join(', ')})`;
}

/** Options for {@link devLogAction}. */
export interface DevLogActionOptions {
  /** Minimum level required to emit. Default `event`. */
  level?: DevLogLevel;
  /** Actor label; defaults to local profile name. */
  actor?: string | null;
  /** When true, only emits at `detail` / `all` (observed remote peers). */
  observed?: boolean;
  room?: string | null;
  round?: number | null;
  /** Appended after the action text (before room/round). */
  details?: string | null;
  date?: Date;
}

/**
 * Unified Metro log line. No-op when level is below the current threshold
 * (and always no-op outside `__DEV__`).
 */
export function devLog(minLevel: DevLogLevel, message: string, actor?: string | null): void {
  if (!isDevLogEnabled(minLevel)) {
    return;
  }
  const line = formatDevLogLine(resolveLocalActorLabel(actor), message);
  if (minLevel === 'error') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Action-oriented helper: `[time] [Actor] action details (room, round N)`.
 * Observed (remote) lines require `detail`+ and are tagged `(observed)`.
 */
export function devLogAction(action: string, options: DevLogActionOptions = {}): void {
  const observed = options.observed === true;
  const minLevel: DevLogLevel = observed ? 'detail' : (options.level ?? 'event');
  if (!isDevLogEnabled(minLevel)) {
    return;
  }

  const parts: string[] = [action.trim()];
  const details = options.details?.trim();
  if (details) {
    parts.push(details);
  }
  if (observed) {
    parts.push('(observed)');
  }
  const suffix = formatRoomRoundSuffix(options.room, options.round);
  const message = `${parts.join(' ')}${suffix}`;
  const line = formatDevLogLine(resolveLocalActorLabel(options.actor), message, options.date);
  if (minLevel === 'error') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
