/** Game session status in Firebase (TZ §8). */
export type GameSessionStatus = 'waiting' | 'playing' | 'finished';

import type { UniqueBonusMode } from '../game/scoring.js';

export interface GameSessionSettings {
  durationSeconds: number;
  /** Resolved for current roster — x2 when unique words and mode allows. */
  uniqueBonusEnabled: boolean;
  /** Organizer intent: auto enables x2 for 3+ players. */
  uniqueBonusMode?: UniqueBonusMode;
  language: string;
  allowProperNouns: boolean;
  allowSlang: boolean;
}

export interface SessionVote {
  proposedBy: string;
  /** Server clock ms when the vote started (for 30s timeout). */
  proposedAt?: number;
  votes: Record<string, 'yes' | 'no'>;
}

export interface AddTimeVote extends SessionVote {
  addMinutes: number;
}

export interface SessionPauseState {
  active: boolean;
  frozenRemainingMs: number;
  frozenAt: number;
}

/** Shared word maps under `session_word_maps/{gameId}`. */
export interface SessionWordMaps {
  /** First submitter per shared word (for score demotion). */
  wordFirst?: Record<string, string>;
  /** Player ids per normalized word (for overlap avatars and global counts). */
  wordPlayers?: Record<string, Record<string, boolean>>;
}

/** Join path for roster players. */
export type PlayerJoinedVia = 'browse' | 'invite';

export interface GameSessionPlayer {
  name: string;
  gender?: 'm' | 'f' | null;
  avatarColorIndex?: number;
  wordCount: number;
  score: number;
  online?: boolean;
  /** Voluntarily left the room; kept in session for standings and results. */
  hasLeft?: boolean;
  /** Uid of the player whose invite link brought this player into the room. */
  invitedBy?: string;
  /** Session pseudonym when identity is masked or room is public. */
  publicAlias?: string;
  /** `browse` = public matchmaking list; `invite` = room code / QR. */
  joinedVia?: PlayerJoinedVia;
}

/**
 * Top-level game session document under `game_sessions/{gameId}`.
 */
export interface GameSession {
  baseWord: string;
  status: GameSessionStatus;
  settings: GameSessionSettings;
  timerEndsAt: number | null;
  /** Server clock ms when the playing round started (rejoin archives, stale-word cutoff). */
  roundStartedAt?: number | null;
  /** Countdown budget in seconds (settings duration + approved add-time); excludes pause wall time. */
  roundTimerBudgetSeconds?: number | null;
  /** Timer/game seconds consumed when the round finished (results, history, WPM). */
  roundPlayedSeconds?: number | null;
  organizerId: string;
  players: Record<string, GameSessionPlayer>;
  /** Merged client-side from `session_word_maps` (not stored on core RTDB node). */
  wordFirst?: Record<string, string>;
  /** Merged client-side from `session_word_maps` (not stored on core RTDB node). */
  wordPlayers?: Record<string, Record<string, boolean>>;
  earlyFinishVote?: SessionVote | null;
  pauseVote?: SessionVote | null;
  addTimeVote?: AddTimeVote | null;
  /** Vote to leave pause; active only while `pauseState.active`. */
  resumeVote?: SessionVote | null;
  pauseState?: SessionPauseState | null;
  /** Uids in join order — who picks baseWord rotates each rematch. */
  baseWordPickerOrder?: string[];
  /** Increments on rematch; indexes into baseWordPickerOrder. */
  baseWordRound?: number;
  /** Active base-word picker in waiting lobby (mirrors client rotation; used by RTDB rules). */
  baseWordPickerUid?: string | null;
  /** Who set `baseWord` in the waiting lobby (cleared when picker changes). */
  baseWordChosenBy?: string | null;
  /** Server clock ms when the round ended (`finished`); excludes post-finish modal wait. */
  finishedAt?: number | null;
  /** Unix ms; Cloud Function deletes the session after this time. */
  purgeAfterAt?: number | null;
  /** Uids that left the results screen for home (metadata only). */
  resultsExitedBy?: Record<string, boolean> | null;
  /** Public matchmaking lobby (v2). */
  isPublic?: boolean;
  /** Server ms when room was listed publicly. */
  publicPublishedAt?: number | null;
  /** Cap for public rooms (default 8). */
  maxPlayers?: number | null;
  /** Permanent pseudonyms after any browse join; survives making room private. */
  identityMasked?: boolean;
}
