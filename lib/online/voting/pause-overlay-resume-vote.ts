import type { SessionVote } from '../../firebase/types.js';

/**
 * Prefer the live session's `resumeVote` over a possibly stale prop so the pause
 * overlay tracks RTDB while already open.
 */
export function resolvePauseOverlayResumeVote(
  sessionResumeVote: SessionVote | null | undefined,
  propResumeVote: SessionVote | null | undefined,
): SessionVote | null {
  return sessionResumeVote ?? propResumeVote ?? null;
}
