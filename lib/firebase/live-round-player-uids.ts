export function appendLiveRoundPlayerUid(
  uids: string[] | null | undefined,
  playerId: string,
): string[] {
  const next = uids ? [...uids] : [];
  if (!next.includes(playerId)) {
    next.push(playerId);
  }
  return next;
}
