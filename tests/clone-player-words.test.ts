import { describe, expect, it } from 'vitest';

import { mergeAllPlayerWords } from '../lib/online/clone-player-words.js';
import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';

function word(display: string): StoredPlayerWord {
  return { display, kind: 'normal', points: 1, badge: null, at: 1 };
}

describe('mergeAllPlayerWords', () => {
  it('keeps words after merge into empty snapshot', () => {
    const incoming = new Map([['a', new Map([['cat', word('КІТ')]])]]);
    const merged = mergeAllPlayerWords(new Map(), incoming);
    expect(merged.get('a')?.size).toBe(1);
  });

  it('does not shrink when RTDB later clears to empty', () => {
    const snapshot = new Map([
      [
        'a',
        new Map([
          ['cat', word('КІТ')],
          ['dog', word('ПЕС')],
        ]),
      ],
    ]);
    const merged = mergeAllPlayerWords(snapshot, new Map());
    expect(merged.get('a')?.size).toBe(2);
  });
});
