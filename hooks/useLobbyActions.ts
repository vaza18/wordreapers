import { router } from 'expo-router';
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

import {
  readGameSessionSnapshot,
  rejoinExistingPlayer,
  startGameSession,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { exitOnlineToHome } from '@/lib/online/exit-online-flow';
import type { FinishedRoundArchive } from '@/lib/online/online-session-archive';
import {
  claimPlayRouteNavigation,
  seedPlaySessionBootstrap,
} from '@/lib/online/play-session-bootstrap';
import { restartRematchOnlineRound } from '@/lib/online/restart-rematch-online-round';
import { loadBundledDictionary, loadBundledSupplements } from '@/services/dictionary-service';
import { useProfileStore } from '@/store/profile-store';

interface UseLobbyActionsParams {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  isOrganizer: boolean;
  rematchArchive: FinishedRoundArchive | null | undefined;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface LobbyActions {
  starting: boolean;
  rematchLoading: boolean;
  handleStart: () => Promise<void>;
  handleRematch: () => Promise<void>;
  handleRetryRematch: () => Promise<void>;
  handleLeaveToHome: () => void;
}

/**
 * Lobby button handlers — start round, rematch, retry rematch, leave to home.
 */
export function useLobbyActions({
  gameId,
  myUid,
  session,
  isOrganizer,
  rematchArchive,
  setError,
}: UseLobbyActionsParams): LobbyActions {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);

  const handleRematch = async () => {
    if (!myUid || !session) {
      return;
    }
    setRematchLoading(true);
    setError(null);
    try {
      await restartRematchOnlineRound(gameId, myUid, session.baseWordRound ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message !== 'REMATCH_FAILED') {
        setError(t('online.errorRematchFailed'));
      }
    } finally {
      setRematchLoading(false);
    }
  };

  const handleRetryRematch = async () => {
    if (!myUid || !rematchArchive) {
      return;
    }
    setRematchLoading(true);
    setError(null);
    try {
      await restartRematchOnlineRound(gameId, myUid, rematchArchive.baseWordRound);
      const { name, gender, avatarColorIndex } = useProfileStore.getState();
      await rejoinExistingPlayer(gameId, myUid, { name, gender, avatarColorIndex });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'NO_FINISHED_ARCHIVE') {
        setError(t('online.roomClosedHint'));
      } else {
        setError(t('online.errorRematchFailed'));
      }
    } finally {
      setRematchLoading(false);
    }
  };

  const handleStart = async () => {
    if (!session || !myUid) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await Promise.all([loadBundledDictionary(), loadBundledSupplements()]);
      await startGameSession(gameId, myUid);
      const snapshot = await readGameSessionSnapshot(gameId);
      if (claimPlayRouteNavigation(gameId, snapshot)) {
        seedPlaySessionBootstrap(snapshot);
        router.replace({ pathname: '/online/play/[gameId]', params: { gameId } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'BASE_WORD_MISSING') {
        setError(t('online.errorBaseWordMissing'));
      } else {
        setError(t('online.errorStartFailed'));
      }
    } finally {
      setStarting(false);
    }
  };

  const handleLeaveToHome = useCallback(() => {
    if (!myUid) {
      return;
    }
    void exitOnlineToHome({
      gameId,
      uid: myUid,
      isOrganizer: Boolean(isOrganizer),
      sessionStatus: session?.status ?? 'waiting',
      session,
    });
  }, [gameId, isOrganizer, myUid, session]);

  return {
    starting,
    rematchLoading,
    handleStart,
    handleRematch,
    handleRetryRematch,
    handleLeaveToHome,
  };
}
