import { describe, expect, it } from 'vitest';

import { sessionWithWordPlayersForExit } from '../lib/online/session/session-with-word-players-for-exit.js';
import { gameSession } from './helpers/game-session-fixtures.js';

describe('sessionWithWordPlayersForExit', () => {
  it('merges own words into maps when session wordPlayers is empty', () => {
    const session = gameSession({ status: 'playing', wordPlayers: {} });
    const next = sessionWithWordPlayersForExit(session, {
      ownUid: 'org',
      ownWords: ['порт', 'рот'],
    });
    expect(next.wordPlayers).toEqual({
      порт: { org: true },
      рот: { org: true },
    });
  });

  it('prefers live maps then merges own words', () => {
    const session = gameSession({ status: 'playing', wordPlayers: {} });
    const next = sessionWithWordPlayersForExit(session, {
      wordPlayers: { тор: { peer: true } },
      ownUid: 'org',
      ownWords: new Set(['порт']),
    });
    expect(next.wordPlayers).toEqual({
      тор: { peer: true },
      порт: { org: true },
    });
  });
});
