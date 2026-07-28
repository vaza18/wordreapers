import { describe, expect, it } from 'vitest';

import {
  parseActiveOnlineGameId,
  resolveActiveOnlineGameIdForSync,
} from '../lib/online/parse-active-online-game-id.js';

describe('parseActiveOnlineGameId', () => {
  it('protects play and results routes', () => {
    expect(parseActiveOnlineGameId('/online/play/ABCDE')).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/results/ABCDE')).toBe('ABCDE');
  });

  it('protects rematch lobby and pick-word routes', () => {
    expect(parseActiveOnlineGameId('/online/lobby/ABCDE')).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/pick-word/ABCDE')).toBe('ABCDE');
  });

  it('ignores unrelated routes', () => {
    expect(parseActiveOnlineGameId('/')).toBeNull();
    expect(parseActiveOnlineGameId('/online')).toBeNull();
    expect(parseActiveOnlineGameId('/settings')).toBeNull();
  });

  it('tolerates trailing slash and query; rejects nested segments', () => {
    expect(parseActiveOnlineGameId('/online/lobby/ABCDE/')).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/lobby/ABCDE?optedIn=1')).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/lobby/ABCDE/extra')).toBeNull();
  });

  it('protects setup via query string or search params gameId', () => {
    expect(parseActiveOnlineGameId('/online/setup?gameId=ABCDE&from=lobby')).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/setup', { gameId: 'ABCDE' })).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/setup', { gameId: ['ABCDE'] })).toBe('ABCDE');
    expect(parseActiveOnlineGameId('/online/setup')).toBeNull();
  });
});

describe('resolveActiveOnlineGameIdForSync', () => {
  it('uses routeGameId only on setup; ignores stale params elsewhere', () => {
    expect(resolveActiveOnlineGameIdForSync('/online/setup', 'STALE')).toBe('STALE');
    expect(resolveActiveOnlineGameIdForSync('/online/lobby/ABCDE', 'STALE')).toBe('ABCDE');
    expect(resolveActiveOnlineGameIdForSync('/', 'STALE')).toBeNull();
  });
});
