import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFinishedRoundArchive = vi.fn();

vi.mock('../lib/online/session/online-session-archive.js', () => ({
  getFinishedRoundArchive: (...args: unknown[]) => getFinishedRoundArchive(...args),
}));

import {
  freezeFinishedRound,
  loadFrozenFinishedRoundBeforeLive,
  loadFrozenFinishedRoundFromArchive,
  loadLatestFrozenFinishedRoundFromArchive,
} from '../lib/online/session/frozen-finished-round.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

const session = finishedSession();
const archive = {
  gameId: 'ABCDE',
  baseWordRound: 0,
  savedAt: 1_000,
  session,
  playerWords: {
    org: {
      порт: { display: 'порт', at: 100 },
    },
  },
};

describe('frozen-finished-round', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('freezes a finished session and clones player words', () => {
    const words = new Map([['org', new Map([['порт', { display: 'порт', at: 100 }]])]]);

    const frozen = freezeFinishedRound('ABCDE', session, words);

    expect(frozen.session.id).toBe('ABCDE');
    expect(frozen.words.get('org')?.get('порт')).toEqual({ display: 'порт', at: 100 });
    expect(frozen.words).not.toBe(words);
  });

  it('loads a frozen round from local archive', async () => {
    getFinishedRoundArchive.mockResolvedValue(archive);

    const frozen = await loadFrozenFinishedRoundFromArchive('ABCDE', 0);

    expect(frozen?.savedAt).toBe(1_000);
    expect(frozen?.words.get('org')?.get('порт')).toEqual({ display: 'порт', at: 100 });
  });

  it('loads the latest archived round when searching backwards', async () => {
    getFinishedRoundArchive.mockImplementation(async (_gameId: string, round: number) =>
      round === 1
        ? { ...archive, baseWordRound: 1, session: { ...archive.session, baseWordRound: 1 } }
        : null,
    );

    const frozen = await loadLatestFrozenFinishedRoundFromArchive('ABCDE', 2);

    expect(frozen?.session.baseWordRound).toBe(1);
  });

  it('loads the latest archive strictly before the live baseWordRound', async () => {
    getFinishedRoundArchive.mockImplementation(async (_gameId: string, round: number) =>
      round === 0 ? archive : null,
    );

    const frozen = await loadFrozenFinishedRoundBeforeLive('ABCDE', 2);

    expect(frozen?.session.baseWordRound).toBe(0);
  });

  it('returns null when no archive exists', async () => {
    getFinishedRoundArchive.mockResolvedValue(null);

    await expect(loadFrozenFinishedRoundFromArchive('ABCDE', 0)).resolves.toBeNull();
  });
});
