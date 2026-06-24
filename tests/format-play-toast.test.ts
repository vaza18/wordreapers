import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { formatPlayToastEvent } from '../lib/online/format-play-toast.js';
import type { PlayToastEvent } from '../lib/online/play-toast-events.js';

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === 'game.toastOvertookMe_m' && params?.name) {
    return `⚠️ ${params.name} щойно тебе обігнав`;
  }
  if (key === 'game.toastYieldedToMe_m' && params?.name) {
    return `👍 ${params.name} поступився тобі місцем`;
  }
  return key;
};

function maskedSession(): GameSession {
  return {
    baseWord: 'аквапланування',
    status: 'playing',
    identityMasked: true,
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'me',
    players: {
      me: { name: 'iPad Pro 13', wordCount: 1, score: 1, gender: 'm' },
      other: {
        name: 'iPhone 13 Pro Max',
        publicAlias: 'Гравець 2',
        wordCount: 2,
        score: 2,
        gender: 'm',
        joinedVia: 'browse',
      },
    },
  };
}

describe('formatPlayToastEvent', () => {
  it('masks opponent name in overtook_me toasts', () => {
    const session = maskedSession();
    const event: PlayToastEvent = {
      type: 'overtook_me',
      playerId: 'other',
      name: 'iPhone 13 Pro Max',
      gender: 'm',
    };

    expect(formatPlayToastEvent(t, event, 'm', session, 'me')).toBe(
      '⚠️ Гравець 2 щойно тебе обігнав',
    );
  });

  it('uses masculine agreement for pseudonym in yielded_to_me toasts', () => {
    const session = maskedSession();
    const event: PlayToastEvent = {
      type: 'yielded_to_me',
      playerId: 'other',
      name: 'iPhone 13 Pro Max',
      gender: 'f',
    };

    expect(formatPlayToastEvent(t, event, 'm', session, 'me')).toBe(
      '👍 Гравець 2 поступився тобі місцем',
    );
  });
});
