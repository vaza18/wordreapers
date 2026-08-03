import { buildStandingsFromSessionWordMaps } from '@/lib/game/scoring';
import { isSoloStandings } from '@/lib/game/solo-round';
import {
  DEFAULT_SPLIT_PLAYER_STATS,
  didPlayerWinOnlineRound,
  normalizeProfilePlayerName,
  type SplitPlayerStats,
} from '@/lib/profile/player-stats';
import { resolveGameSessionSettingsForSession } from '@/lib/firebase/session-settings';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';
import { wordPlayersFromWordsByPlayer } from '@/lib/online/word-players-invert';

function wordsMapFromArchive(archive: FinishedRoundArchive): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [uid, words] of Object.entries(archive.playerWords ?? {})) {
    if (Array.isArray(words)) {
      map.set(uid, words);
    }
  }
  return map;
}

function standingsFromArchive(archive: FinishedRoundArchive) {
  const wordsByPlayer = wordsMapFromArchive(archive);
  const wordPlayers =
    Object.keys(archive.session.wordPlayers ?? {}).length > 0
      ? archive.session.wordPlayers
      : wordPlayersFromWordsByPlayer(wordsByPlayer);
  const uniqueBonusEnabled = resolveGameSessionSettingsForSession(
    archive.session,
  ).uniqueBonusEnabled;
  return buildStandingsFromSessionWordMaps(
    { players: archive.session.players, wordPlayers },
    uniqueBonusEnabled,
  );
}

function wordCountForUid(archive: FinishedRoundArchive, uid: string): number {
  const words = archive.playerWords?.[uid];
  if (Array.isArray(words)) {
    return words.length;
  }
  return standingsFromArchive(archive).find((row) => row.playerId === uid)?.wordCount ?? 0;
}

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
    const standings = standingsFromArchive(archive);
    const isSolo = isSoloStandings(standings);

    if (isSolo) {
      const soloPlayer = archive.session.players.solo;
      if (!soloPlayer || !nameKey) {
        continue;
      }
      if (normalizeProfilePlayerName(soloPlayer.name) !== nameKey) {
        continue;
      }
      const soloWords = wordCountForUid(archive, 'solo');
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
    competition.wordsCollected += wordCountForUid(archive, playerUid);
    if (didPlayerWinOnlineRound(playerUid, standings)) {
      competition.gamesWon += 1;
    }
  }

  return { competition, training };
}
