/**
 * Restart a short one-shot clip from the beginning.
 *
 * Must await seek before play: on iOS AVPlayer stays at the end after finish,
 * so play()-then-async-seek silently no-ops every other press.
 */
export type ReplayableSoundPlayer = {
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
};

export async function replayFromStart(player: ReplayableSoundPlayer): Promise<void> {
  await player.seekTo(0);
  player.play();
}
