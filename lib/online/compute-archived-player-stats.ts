import { buildStandingsFromSession } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import {
  DEFAULT_SPLIT_PLAYER_STATS,
  didPlayerWinOnlineRound,
  normalizeProfilePlayerName,
  type SplitPlayerStats,
} from '@/lib/profile/player-stats';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

/** Profile + Firebase uid stats derived from locally archived finished rounds. */
export function computeArchivedPlayerStats(
  archives: readonly FinishedRoundArchive[],
  playerUid: string,
  profileName: string,
): SplitPlayerStats {
  const nameKey = normalizeProfilePlayerName(profileName);
  const competition = { ...DEFAULT_SPLIT_PLAYER_STATS.competition };
  const training = { ...DEFAULT_SPLIT_PLAYER_STATS.training };

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
      const soloWords = soloPlayer.wordCount ?? 0;
      if (soloWords <= 0) {
        continue;
      }
      training.roundsPlayed += 1;
      training.wordsCollected += soloWords;
      continue;
    }

    const player = archive.session.players[playerUid];
    if (!player) {
      continue;
    }
    competition.gamesPlayed += 1;
    competition.wordsCollected += player.wordCount ?? 0;
    if (didPlayerWinOnlineRound(playerUid, standings)) {
      competition.gamesWon += 1;
    }
  }

  return { competition, training };
}
