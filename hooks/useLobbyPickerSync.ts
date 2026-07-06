import { useEffect, useRef } from 'react';

import {
  syncLobbyPickerState,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import { clearWaitingLobbyPlayerWordsAsOrganizer } from '@/lib/firebase/player-words-service';
import { syncPublicRosterAliases } from '@/lib/firebase/public-lobby-service';
import { currentBaseWordPickerUid } from '@/lib/online/base-word-picker';
import { needsPublicAliasReconcile } from '@/lib/online/public-lobby/public-alias';

interface UseLobbyPickerSyncParams {
  gameId: string;
  session: GameSessionSnapshot | null;
  isOrganizer: boolean;
  myUid: string;
}

/**
 * Reconciles picker drift, clears waiting-lobby player words for the organizer,
 * and keeps public roster aliases in sync while the lobby is waiting.
 */
export function useLobbyPickerSync({
  gameId,
  session,
  isOrganizer,
  myUid,
}: UseLobbyPickerSyncParams): void {
  const lobbyWordsClearedForRoundRef = useRef<number | null>(null);
  const pickerSyncAttemptKeyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const shouldReconcilePublicAliases = session ? needsPublicAliasReconcile(session) : false;
  const publicAliasRound = session?.baseWordRound ?? 0;

  useEffect(() => {
    const liveSession = sessionRef.current;
    if (!gameId || !liveSession || !shouldReconcilePublicAliases) {
      return;
    }
    void syncPublicRosterAliases(gameId, liveSession);
  }, [gameId, publicAliasRound, shouldReconcilePublicAliases]);

  useEffect(() => {
    if (!gameId || !session || session.status !== 'waiting') {
      pickerSyncAttemptKeyRef.current = null;
      return;
    }
    const picker = currentBaseWordPickerUid(session);
    const pickerDrifted = session.baseWordPickerUid !== picker;
    const wordDrifted = Boolean(
      session.baseWord && session.baseWordChosenBy && session.baseWordChosenBy !== picker,
    );
    if (!pickerDrifted && !wordDrifted) {
      pickerSyncAttemptKeyRef.current = null;
      return;
    }
    const driftKey = `${session.baseWordRound ?? 0}:${session.baseWordPickerUid ?? ''}:${picker}:${session.baseWordChosenBy ?? ''}`;
    if (pickerSyncAttemptKeyRef.current === driftKey) {
      return;
    }
    pickerSyncAttemptKeyRef.current = driftKey;
    void syncLobbyPickerState(gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- picker drift uses live session snapshot via ref
  }, [
    gameId,
    session?.baseWord,
    session?.baseWordChosenBy,
    session?.baseWordPickerUid,
    session?.baseWordRound,
    session?.status,
    session?.players,
  ]);

  useEffect(() => {
    if (!gameId || !session || session.status !== 'waiting' || !isOrganizer || !myUid) {
      return;
    }
    const round = session.baseWordRound ?? 0;
    if (lobbyWordsClearedForRoundRef.current === round) {
      return;
    }
    lobbyWordsClearedForRoundRef.current = round;
    void clearWaitingLobbyPlayerWordsAsOrganizer(gameId, session, myUid);
  }, [gameId, isOrganizer, myUid, session]);
}
