import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { detectRematchToastEvent } from '../lib/online/rematch-toast-events.js';

function session(
  status: GameSession['status'],
  baseWordRound: number,
  players: GameSession['players'],
): GameSession {
  return {
    baseWord: status === 'waiting' ? '' : 'тест',
    status,
    baseWordRound,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: status === 'playing' ? Date.now() + 60_000 : null,
    organizerId: 'org',
    baseWordPickerOrder: ['org', 'p2'],
    players,
  };
}

describe('detectRematchToastEvent', () => {
  it('detects finished → waiting rematch with picker and round number', () => {
    const players = {
      org: { name: 'Організатор', gender: 'm' as const, wordCount: 0, score: 0, online: true },
      p2: { name: 'Маша', gender: 'f' as const, wordCount: 0, score: 0, online: true },
    };
    const prev = session('finished', 0, {
      org: { name: 'Організатор', wordCount: 3, score: 5, online: true },
      p2: { name: 'Маша', wordCount: 2, score: 4, online: true },
    });
    const curr = session('waiting', 1, players);

    expect(detectRematchToastEvent(prev, curr)).toEqual({
      type: 'rematch_reopened',
      pickerId: 'p2',
      pickerName: 'Маша',
      pickerGender: 'f',
      roundNumber: 2,
    });
  });

  it('returns null outside finished → waiting transition', () => {
    const players = {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    };
    const prev = session('playing', 0, players);
    const curr = session('finished', 0, players);
    expect(detectRematchToastEvent(prev, curr)).toBeNull();
  });
});
