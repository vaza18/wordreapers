import { beforeEach, describe, expect, it, vi } from 'vitest';

const runRtdbTransaction = vi.fn();
const markPlayerOnline = vi.fn();
const reserveUniqueRoomCode = vi.fn();
const getServerNow = vi.fn();
const restoreSessionWordsToRtdb = vi.fn();
const updateLocalRoomDraft = vi.fn();
const setLocalRoomPublishedGameId = vi.fn();
const setOrganizerWaitingRoom = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('../lib/firebase/rtdb-transaction.js', () => ({
  runRtdbTransaction: (...args: unknown[]) => runRtdbTransaction(...args),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  markPlayerOnline: (...args: unknown[]) => markPlayerOnline(...args),
}));

vi.mock('../lib/firebase/reserve-room-code.js', () => ({
  reserveUniqueRoomCode: (...args: unknown[]) => reserveUniqueRoomCode(...args),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => getServerNow(),
}));

vi.mock('../lib/online/restore-session-words-to-rtdb.js', () => ({
  restoreSessionWordsToRtdb: (...args: unknown[]) => restoreSessionWordsToRtdb(...args),
}));

vi.mock('../lib/online/local-room-draft.js', () => ({
  updateLocalRoomDraft: (...args: unknown[]) => updateLocalRoomDraft(...args),
  setLocalRoomPublishedGameId: (...args: unknown[]) => setLocalRoomPublishedGameId(...args),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: (...args: unknown[]) => setOrganizerWaitingRoom(...args),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

import {
  publishPlayingSoloForDraft,
  publishPlayingSoloRound,
  publishWaitingRoom,
  publishWaitingRoomForDraft,
} from '../lib/online/publish-room.js';

const profile = { name: 'Org', avatarColorIndex: 2, gender: 'f' as const };
const setup = {
  baseWord: 'портрет',
  baseWordDisplay: 'Портрет',
  durationMinutes: 10,
  uniqueBonusMode: 'off' as const,
  allowProperNouns: false,
  allowSlang: false,
};
const draft = {
  draftId: 'ABCDE',
  preferredCode: 'ABCDE',
  profile,
  setup: null,
  publishedGameId: null,
};

describe('publish-room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reserveUniqueRoomCode.mockResolvedValue('ABCDE');
    runRtdbTransaction.mockResolvedValue({ committed: true });
    markPlayerOnline.mockResolvedValue(undefined);
    getServerNow.mockReturnValue(1_000);
    restoreSessionWordsToRtdb.mockResolvedValue(undefined);
    updateLocalRoomDraft.mockReturnValue(draft);
    ensureAnonymousAuth.mockResolvedValue({ uid: 'org-1' });
  });

  it('publishes a waiting room and tracks organizer lobby', async () => {
    const gameId = await publishWaitingRoom({
      draft,
      setup,
      organizerUid: 'org-1',
    });

    expect(gameId).toBe('ABCDE');
    expect(runRtdbTransaction).toHaveBeenCalled();
    expect(markPlayerOnline).toHaveBeenCalledWith('ABCDE', 'org-1');
    expect(updateLocalRoomDraft).toHaveBeenCalledWith('ABCDE', {
      setup,
      publishedGameId: 'ABCDE',
    });
    expect(setLocalRoomPublishedGameId).toHaveBeenCalledWith('ABCDE', 'ABCDE');
    expect(setOrganizerWaitingRoom).toHaveBeenCalledWith('ABCDE');
  });

  it('throws when the room code transaction fails to commit', async () => {
    runRtdbTransaction.mockResolvedValue({ committed: false });

    await expect(publishWaitingRoom({ draft, setup, organizerUid: 'org-1' })).rejects.toThrow(
      'ROOM_CODE_CONFLICT',
    );
  });

  it('publishes an in-progress solo round with words and timer fields', async () => {
    const gameId = await publishPlayingSoloRound({
      draft,
      setup,
      organizerUid: 'org-1',
      words: [
        {
          normalized: 'порт',
          display: 'порт',
          kind: 'unique',
          points: 5,
          badge: 'x2',
          at: 500,
        },
      ],
      score: 12,
      wordCount: 1,
      remainingMs: 90_000,
      paused: false,
    });

    expect(gameId).toBe('ABCDE');
    expect(restoreSessionWordsToRtdb).toHaveBeenCalled();
    expect(markPlayerOnline).toHaveBeenCalledWith('ABCDE', 'org-1');
    expect(setOrganizerWaitingRoom).not.toHaveBeenCalled();
  });

  it('uses anonymous auth wrappers for draft publish helpers', async () => {
    await publishWaitingRoomForDraft(draft, setup);
    expect(ensureAnonymousAuth).toHaveBeenCalled();

    await publishPlayingSoloForDraft(draft, setup, {
      words: [],
      score: 0,
      wordCount: 0,
      remainingMs: 60_000,
      paused: true,
    });
    expect(ensureAnonymousAuth).toHaveBeenCalledTimes(2);
  });
});
