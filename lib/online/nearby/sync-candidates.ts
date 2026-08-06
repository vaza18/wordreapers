/**
 * Ordered peer uids to ask for missing archives: invitedBy first (if online), then other online uids.
 */
export function orderedSyncCandidateUids(input: {
  selfUid: string;
  invitedByUid?: string | null;
  onlineUids: readonly string[];
}): string[] {
  const { selfUid, invitedByUid, onlineUids } = input;
  const online = new Set(onlineUids.filter((uid) => uid && uid !== selfUid));
  const result: string[] = [];

  if (invitedByUid && online.has(invitedByUid)) {
    result.push(invitedByUid);
    online.delete(invitedByUid);
  }

  for (const uid of [...online].sort((a, b) => a.localeCompare(b))) {
    result.push(uid);
  }

  return result;
}
