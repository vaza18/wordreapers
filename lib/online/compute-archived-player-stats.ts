import { buildStandingsFromSession } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import {
  didPlayerWinOnlineRound,
  normalizeProfilePlayerName,
  type PlayerStats,
} from '@/lib/profile/player-stats';
import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';

/** Profile + Firebase uid stats derived from locally archived finished rounds. */
export function computeArchivedPlayerStats(
  archives: readonly FinishedRoundArchive[],
  playerUid: string,
  profileName: string,
): PlayerStats {
  const nameKey = normalizeProfilePlayerName(profileName);
  let gamesPlayed = 0;
  let gamesWon = 0;
  let wordsCollected = 0;

  for (const archive of archives) {
    const standings = buildStandingsFromSession(archive.session);
    const isSolo = isSoloStandings(standings);

    if (isSolo) {
      const soloPlayer = archive.session.players.solo;
      if (!soloPlayer || !nameKey) {
        continue;
      }
      if (normalizeProfilePlayerName(soloPlayer.name) !== nameKey) {
        continue;
      }
      gamesPlayed += 1;
      wordsCollected += soloPlayer.wordCount ?? 0;
      continue;
    }

    const player = archive.session.players[playerUid];
    if (!player) {
      continue;
    }
    gamesPlayed += 1;
    wordsCollected += player.wordCount ?? 0;
    if (didPlayerWinOnlineRound(playerUid, standings)) {
      gamesWon += 1;
    }
  }

  return { gamesPlayed, gamesWon, wordsCollected };
}
