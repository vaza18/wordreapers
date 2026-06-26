/** Podium emoji prefix for ranks 1–3 (results, history standings). */
export function formatRankWithMedal(rank: number): string {
  if (rank === 1) {
    return `🥇 ${rank}`;
  }
  if (rank === 2) {
    return `🥈 ${rank}`;
  }
  if (rank === 3) {
    return `🥉 ${rank}`;
  }
  return String(rank);
}
