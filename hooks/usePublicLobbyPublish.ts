import { useCallback, useEffect, useMemo, useState } from 'react';

import { loadBundledBaseWords } from '@/services/dictionary-service';
import {
  canPublishPublicRoom,
  type CanPublishPublicFailure,
} from '@/lib/online/public-lobby/content-safety';
import { setRoomPrivate, setRoomPublic } from '@/lib/firebase/public-lobby-service';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';

export type PublishBlockReason = CanPublishPublicFailure | 'BASE_WORDS_LOADING';

export interface UsePublicLobbyPublishResult {
  baseWordsReady: boolean;
  canPublish: boolean;
  publishBlockReason: PublishBlockReason | null;
  toggling: boolean;
  togglePublic: (next: boolean) => Promise<void>;
}

/**
 * Organizer public-room toggle in waiting lobby.
 */
export function usePublicLobbyPublish(
  gameId: string,
  session: GameSessionSnapshot | null,
  organizerUid: string,
): UsePublicLobbyPublishResult {
  const [baseWordNormals, setBaseWordNormals] = useState<string[]>([]);
  const [baseWordsReady, setBaseWordsReady] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadBundledBaseWords()
      .then((words) => {
        if (!cancelled) {
          setBaseWordNormals(words);
          setBaseWordsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBaseWordsReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gate = useMemo(() => {
    if (!session || session.organizerId !== organizerUid || session.status !== 'waiting') {
      return { ok: false as const, reason: null };
    }
    if (!baseWordsReady) {
      return { ok: false as const, reason: 'BASE_WORDS_LOADING' as const };
    }
    return canPublishPublicRoom(session, baseWordNormals);
  }, [baseWordNormals, baseWordsReady, organizerUid, session]);

  const togglePublic = useCallback(
    async (next: boolean) => {
      if (!session || !gameId) {
        return;
      }
      setToggling(true);
      try {
        if (next) {
          await setRoomPublic(gameId, organizerUid, baseWordNormals);
        } else {
          await setRoomPrivate(gameId, organizerUid);
        }
      } finally {
        setToggling(false);
      }
    },
    [baseWordNormals, gameId, organizerUid, session],
  );

  return {
    baseWordsReady,
    canPublish: gate.ok,
    publishBlockReason: gate.ok ? null : gate.reason,
    toggling,
    togglePublic,
  };
}
