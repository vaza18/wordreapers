import type { SessionWordMaps } from '../../firebase/types.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { totalPlayerWordCount, wordPlayersLeafCount } from './live-words-snapshot.js';

/**
 * Whether post-unavailable auto-remount may restore SoT and skip bootstrap fetch.
 *
 * Preserve only for **rich** SoT or when bootstrap was **already** complete
 * (post-bootstrap left/results fail-loud). Incomplete empty listen + unavailable
 * must remount fresh and restart tryFetch — otherwise cancelled late rich fetch
 * + preserved empty bootstrapComplete locks «0 слів» / closes rematch-survival.
 */
export function shouldPreserveRosterMapsOnUnavailableRemount(options: {
  bootstrapComplete: boolean;
  maps: SessionWordMaps | null;
  words: AllPlayerWords;
}): boolean {
  const hasRichSoT =
    wordPlayersLeafCount(options.maps?.wordPlayers) > 0 || totalPlayerWordCount(options.words) > 0;
  if (hasRichSoT) {
    return true;
  }
  return options.bootstrapComplete;
}
