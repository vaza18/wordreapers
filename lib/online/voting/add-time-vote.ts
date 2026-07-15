import type { AddTimeVote, GameSession } from '../../firebase/types.js';
import {
  allRequiredVotedYes,
  anyRequiredVotedNo,
  earlyFinishRequiredVoterIds,
  earlyFinishVoteExpired,
} from './early-finish-vote.js';
import { viewerNeedsSessionVote } from './viewer-needs-session-vote.js';

export const ADD_TIME_MINUTE_OPTIONS = [1, 3, 5, 10, 20] as const;

export function shouldDeferTimerFinishForAddTimeVote(
  addTimeVote: AddTimeVote | null | undefined,
): boolean {
  return addTimeVote != null;
}

/**
 * Client finish tick: defer while RTDB vote exists OR local minute picker is open.
 * Durable cross-device defer is only `addTimeVote` (see `finishGameSessionIfExpired`).
 */
export function shouldDeferClientTimerFinish(options: {
  addTimeVote: AddTimeVote | null | undefined;
  showAddTimeModal: boolean;
}): boolean {
  return options.showAddTimeModal || shouldDeferTimerFinishForAddTimeVote(options.addTimeVote);
}

export type AddTimePickerDismissAction = 'none' | 'finish_round';

/**
 * After closing / failing to propose from the local minute picker: finish if the
 * round timer already elapsed (or Firebase already marked finished) so the proposer
 * is not left on a frozen play UI without «Гру завершено».
 */
export function resolveAddTimePickerDismissAction(options: {
  sessionStatus: string | undefined;
  timerEndsAt: number | null | undefined;
  now: number;
  /** Vote already written — durable defer; do not force local finish. */
  addTimeVoteActive?: boolean;
}): AddTimePickerDismissAction {
  if (options.addTimeVoteActive) {
    return 'none';
  }
  if (options.sessionStatus === 'finished') {
    return 'finish_round';
  }
  if (options.sessionStatus !== 'playing') {
    return 'none';
  }
  if (options.timerEndsAt != null && options.now >= options.timerEndsAt) {
    return 'finish_round';
  }
  return 'none';
}

/** Avoid stacking GameTimeUpModal under the local add-time picker (iOS freeze). */
export function shouldShowTimeUpModal(options: {
  roundEnded: boolean;
  showAddTimeModal: boolean;
}): boolean {
  return options.roundEnded && !options.showAddTimeModal;
}

export function shouldFinishRoundAfterTimerExpired(
  timerEndsAt: number | null,
  now: number,
): boolean {
  return timerEndsAt !== null && now >= timerEndsAt;
}

export function computeExtendedTimerEndsAt(
  timerEndsAt: number | null,
  addMinutes: number,
  now: number,
): number {
  const base = Math.max(timerEndsAt ?? now, now);
  return base + addMinutes * 60_000;
}

export function addTimeVoteRequiredIds(session: GameSession, proposerId: string): string[] {
  return earlyFinishRequiredVoterIds(session, proposerId);
}

export function viewerNeedsAddTimeVote(
  session: GameSession,
  vote: AddTimeVote,
  viewerId: string,
): boolean {
  return viewerNeedsSessionVote(session, vote, viewerId, addTimeVoteRequiredIds);
}

export function shouldApplyAddTimeFromVote(session: GameSession, vote: AddTimeVote): boolean {
  const required = addTimeVoteRequiredIds(session, vote.proposedBy);
  return allRequiredVotedYes(vote, required);
}

export function shouldClearAddTimeVote(
  session: GameSession,
  vote: AddTimeVote,
  now: number,
): boolean {
  const required = addTimeVoteRequiredIds(session, vote.proposedBy);
  if (anyRequiredVotedNo(vote, required)) {
    return true;
  }
  return earlyFinishVoteExpired(vote, now);
}
