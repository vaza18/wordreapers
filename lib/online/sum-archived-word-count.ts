import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';

/** Total accepted words for one player across locally archived online rounds. */
export function sumArchivedWordCountForPlayer(
  archives: readonly FinishedRoundArchive[],
  playerUid: string,
): number {
  return archives.reduce((sum, archive) => {
    const count = archive.session.players[playerUid]?.wordCount ?? 0;
    return sum + count;
  }, 0);
}
