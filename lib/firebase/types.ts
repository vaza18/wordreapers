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
}

/**
 * Top-level game session document under `game_sessions/{gameId}`.
 */
export interface GameSession {
  baseWord: string;
  status: GameSessionStatus;
  settings: GameSessionSettings;
  timerEndsAt: number | null;
  organizerId: string;
  players: Record<string, GameSessionPlayer>;
  /** How many players submitted each normalized word (for x2 / overlap UI). */
  wordCounts?: Record<string, number>;
  /** First submitter per shared word (for score demotion). */
  wordFirst?: Record<string, string>;
  /** Player ids per normalized word (for overlap avatars). */
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
  /** Server clock ms when the round ended (`finished`); excludes post-finish modal wait. */
  finishedAt?: number | null;
  /** Unix ms; Cloud Function deletes the session after this time. */
  purgeAfterAt?: number | null;
  /** Uids that left the results screen for home (metadata only). */
  resultsExitedBy?: Record<string, boolean> | null;
}
