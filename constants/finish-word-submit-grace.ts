/**
 * Keep RTDB `status: playing` this long after `timerEndsAt` so in-flight word
 * shard writes can still commit. Rules also allow a short post-finish append
 * window (`finishedAt + 15000` in `firebase/database.rules.json`) for force-finish
 * / clock skew — that literal lives only in rules (RTDB cannot import TS).
 *
 * Local play UI treats the round as over at `timerEndsAt` (no new submits /
 * time-up modal). Network `finishGameSessionIfExpired` wakes only after this
 * grace (`timerFinishNetworkExpiresAt`) so clients do not spam full-session gets
 * while finish is a known no-op.
 */
export const FINISH_WORD_SUBMIT_GRACE_MS = 5_000;
