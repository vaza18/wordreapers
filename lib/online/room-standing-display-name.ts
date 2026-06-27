import { displayPlayerName } from '@/lib/online/public-lobby/display-player-name';
import type { RoomHistoryAggregate } from '@/lib/online/room-history-aggregate';

/** Viewer-aware label from the newest archived round the player joined. */
export function roomStandingDisplayName(
  playerId: string,
  aggregate: RoomHistoryAggregate,
  viewerUid: string,
): string {
  for (const archive of aggregate.archives) {
    const player = archive.session.players[playerId];
    if (player) {
      return displayPlayerName(player, viewerUid, playerId, archive.session);
    }
  }
  return aggregate.standings.find((row) => row.playerId === playerId)?.name ?? playerId;
}
