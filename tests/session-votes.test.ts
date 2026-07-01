import { describe, expect, it } from 'vitest';

import { votingPlayerIds } from '../lib/online/voting-player-ids.js';
import { playingSession, sessionWithPlayers } from './helpers/game-session-fixtures.js';

describe('votingPlayerIds', () => {
  it('during playing includes only live-round participants', () => {
    const ids = votingPlayerIds(
      playingSession({
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
    );
    expect(ids).toEqual(['a']);
  });

  it('includes active and offline players when not playing', () => {
    const ids = votingPlayerIds(
      sessionWithPlayers({
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
    );
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('excludes players who left voluntarily when not playing', () => {
    const ids = votingPlayerIds(
      sessionWithPlayers({
        a: { name: 'A', wordCount: 0, score: 0 },
        b: { name: 'B', wordCount: 0, score: 0, hasLeft: true },
      }),
    );
    expect(ids).toEqual(['a']);
  });
});
