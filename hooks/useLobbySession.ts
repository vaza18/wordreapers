import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  subscribeGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  latestFinishedArchiveForGame,
  type FinishedRoundArchive,
} from '@/lib/online/online-session-archive';

export interface LobbySessionState {
  session: GameSessionSnapshot | null;
  firebaseSessionLive: boolean;
  loading: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  rematchArchive: FinishedRoundArchive | null | undefined;
}

/**
 * Subscribes to the game session and, when no live session exists, loads the
 * latest finished-round archive so the lobby can offer a rematch.
 */
export function useLobbySession(gameId: string): LobbySessionState {
  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [firebaseSessionLive, setFirebaseSessionLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rematchArchive, setRematchArchive] = useState<FinishedRoundArchive | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }
    void ensureAnonymousAuth();
    const unsubscribe = subscribeGameSession(gameId, (next) => {
      setSession(next);
      setFirebaseSessionLive(Boolean(next));
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, [gameId]);

  useEffect(() => {
    if (loading || session) {
      return;
    }
    let cancelled = false;
    void latestFinishedArchiveForGame(gameId).then((archive) => {
      if (!cancelled) {
        setRematchArchive(archive);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, loading, session]);

  return { session, firebaseSessionLive, loading, error, setError, rematchArchive };
}
