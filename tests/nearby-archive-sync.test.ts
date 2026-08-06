import { describe, expect, it } from 'vitest';

import {
  expectedPriorRounds,
  hasCompletePriorHistory,
  haveRoundsCompleteForN,
  missingRoundArchives,
} from '@/lib/online/nearby/missing-round-archives';
import { PeerHaveRoundsMap } from '@/lib/online/nearby/peer-have-rounds';
import {
  createHaveAckMessage,
  createWantMessage,
  isAuthorizedNearbyRequester,
} from '@/lib/online/nearby/protocol';
import { shouldAdvertiseForLobbyRoster } from '@/lib/online/nearby/should-advertise-lobby';
import { stripArchiveForTransfer } from '@/lib/online/nearby/strip-archive';
import { orderedSyncCandidateUids } from '@/lib/online/nearby/sync-candidates';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

function archiveStub(round: number): Pick<FinishedRoundArchive, 'baseWordRound'> {
  return { baseWordRound: round };
}

describe('missingRoundArchives', () => {
  it('returns empty when N is 0', () => {
    expect(expectedPriorRounds(0)).toEqual([]);
    expect(missingRoundArchives(0, [])).toEqual([]);
    expect(hasCompletePriorHistory(0, [])).toBe(true);
  });

  it('finds gaps in 0..N-1', () => {
    expect(missingRoundArchives(4, [archiveStub(0), archiveStub(1), archiveStub(3)])).toEqual([2]);
    expect(hasCompletePriorHistory(4, [0, 1, 2, 3].map(archiveStub))).toBe(true);
  });
});

describe('orderedSyncCandidateUids', () => {
  it('puts invitedBy first when online', () => {
    expect(
      orderedSyncCandidateUids({
        selfUid: 'me',
        invitedByUid: 'inviter',
        onlineUids: ['z', 'inviter', 'a', 'me'],
      }),
    ).toEqual(['inviter', 'a', 'z']);
  });

  it('skips invitedBy when not online', () => {
    expect(
      orderedSyncCandidateUids({
        selfUid: 'me',
        invitedByUid: 'inviter',
        onlineUids: ['a', 'me'],
      }),
    ).toEqual(['a']);
  });
});

describe('shouldAdvertiseForLobbyRoster + HaveAck', () => {
  it('advertises until peers HaveAck-complete, including non-participants', () => {
    const peerHave = new PeerHaveRoundsMap();
    const gameId = '8PJWY';
    const input = {
      baseWordRound: 3,
      selfUid: 'vasyl',
      onlineUids: ['vasyl', 'ipad', 'vasylina'],
      localPriorArchiveCount: 3,
      peerHave,
      gameId,
    };

    expect(shouldAdvertiseForLobbyRoster(input)).toBe(true);

    peerHave.setHaveRounds(gameId, 'ipad', [0, 1, 2], 'trusted');
    peerHave.setHaveRounds(gameId, 'vasylina', [0, 1], 'trusted');
    expect(shouldAdvertiseForLobbyRoster(input)).toBe(true);
    expect(haveRoundsCompleteForN(3, [0, 1])).toBe(false);

    peerHave.setHaveRounds(gameId, 'vasylina', [0, 1, 2], 'trusted');
    expect(shouldAdvertiseForLobbyRoster(input)).toBe(false);
  });

  it('does not advertise at round 0 or without local archives', () => {
    const peerHave = new PeerHaveRoundsMap();
    expect(
      shouldAdvertiseForLobbyRoster({
        baseWordRound: 0,
        selfUid: 'a',
        onlineUids: ['a', 'b'],
        localPriorArchiveCount: 0,
        peerHave,
        gameId: 'K',
      }),
    ).toBe(false);
  });
});

describe('Want auth', () => {
  it('requires matching gameId and roster uid', () => {
    const want = createWantMessage('ab12', 'uid-b', [0, 1]);
    expect(
      isAuthorizedNearbyRequester({
        messageGameId: want.gameId,
        messageUid: want.uid,
        sessionGameId: 'AB12',
        rosterUids: ['uid-a', 'uid-b'],
      }),
    ).toBe(true);
    expect(
      isAuthorizedNearbyRequester({
        messageGameId: want.gameId,
        messageUid: 'stranger',
        sessionGameId: 'AB12',
        rosterUids: ['uid-a', 'uid-b'],
      }),
    ).toBe(false);
  });
});

describe('strip + backfill eligibility', () => {
  it('strips playableLexicon', () => {
    const stripped = stripArchiveForTransfer({
      gameId: 'K1',
      baseWordRound: 0,
      savedAt: 1,
      session: {
        baseWord: 'тест',
        status: 'finished',
        settings: {
          durationSeconds: 60,
          uniqueBonusEnabled: false,
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        timerEndsAt: null,
        organizerId: 'a',
        players: { a: { name: 'A', wordCount: 1, score: 1 } },
      },
      playerWords: { a: ['слово'] },
      playableLexicon: { maxCount: 1, words: ['слово'], displays: ['слово'] },
    });
    expect(stripped).not.toHaveProperty('playableLexicon');
  });

  it('HaveAck message shape for completion handshake', () => {
    expect(createHaveAckMessage('K1', 'ipad', [0, 1, 2]).type).toBe('haveAck');
  });
});
