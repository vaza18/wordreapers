let trackedWaitingRoomId: string | null = null;

export function setOrganizerWaitingRoom(gameId: string | null): void {
  trackedWaitingRoomId = gameId ? gameId.toUpperCase() : null;
}

export function getOrganizerWaitingRoom(): string | null {
  return trackedWaitingRoomId;
}

/** Returns the tracked room id and clears it (for abandon on new room / exit). */
export function takeOrganizerWaitingRoom(): string | null {
  const gameId = trackedWaitingRoomId;
  trackedWaitingRoomId = null;
  return gameId;
}
