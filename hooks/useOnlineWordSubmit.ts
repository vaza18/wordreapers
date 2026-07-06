import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { TFunction } from 'i18next';

import { toDisplayUpper } from '@/lib/dictionary/normalize';
import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';
import { playWordAcceptedFeedback } from '@/lib/feedback/game-feedback';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import {
  submitOnlineWord,
  type StoredPlayerWord,
  type SubmitWordError,
} from '@/lib/firebase/player-words-service';
import { acceptWord } from '@/lib/game/play-word';
import {
  playWordErrorMessage,
  playWordFeedbackVariant,
  type PlayWordFeedbackVariant,
} from '@/lib/game/play-word-feedback';
import type { LetterKey } from '@/lib/game/letter-keyboard';
import { createSubmitWordProfile, type SubmitWordProfile } from '@/lib/online/submit-word-profile';
import type { FeedbackMode } from '@/lib/settings/feedback-mode';

const VALIDATION_DEBOUNCE_MS = 1000;

type PendingWordSync = {
  normalized: string;
  display: string;
};

type SyncOutcome = 'ok' | 'duplicate' | 'retry' | 'fatal';

type UseOnlineWordSubmitParams = {
  gameId: string;
  myUid: string;
  session: GameSessionSnapshot | null;
  roundLexicon: RoundPlayableLexicon | null | undefined;
  uniqueBonusEnabled: boolean;
  wordsForDisplay: Map<string, StoredPlayerWord>;
  myWordsRef: RefObject<Map<string, StoredPlayerWord>>;
  resultsNavigatedRef: RefObject<boolean>;
  roundEndedRef: RefObject<boolean>;
  isPausedRef: RefObject<boolean>;
  remainingMsRef: RefObject<number>;
  draftKeyIndicesRef: RefObject<number[]>;
  letterKeys: readonly LetterKey[];
  wordAcceptedFeedback: FeedbackMode;
  t: TFunction;
  /** When RTDB reconnects, flush queued word syncs. */
  rtdbOnline: boolean;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  setDraftKeyIndices: Dispatch<SetStateAction<number[]>>;
  setFeedback: (message: string | null) => void;
  setFeedbackVariant: (variant: PlayWordFeedbackVariant) => void;
  setOptimisticWords: Dispatch<SetStateAction<Map<string, StoredPlayerWord>>>;
  setScrollRequest: Dispatch<SetStateAction<{ normalized: string; id: number } | null>>;
  setBackgroundSyncing: (value: boolean) => void;
};

function classifySubmitError(error: SubmitWordError): SyncOutcome {
  if (error === 'DUPLICATE') {
    return 'duplicate';
  }
  if (error === 'NETWORK' || error === 'SESSION_MISSING') {
    return 'retry';
  }
  return 'fatal';
}

/**
 * Local validation, optimistic accept, and Firebase word submit for online play.
 */
export function useOnlineWordSubmit({
  gameId,
  myUid,
  session,
  roundLexicon,
  uniqueBonusEnabled,
  wordsForDisplay,
  myWordsRef,
  resultsNavigatedRef,
  roundEndedRef,
  isPausedRef,
  remainingMsRef,
  draftKeyIndicesRef,
  letterKeys,
  wordAcceptedFeedback,
  t,
  rtdbOnline,
  draft,
  setDraft,
  setDraftKeyIndices,
  setFeedback,
  setFeedbackVariant,
  setOptimisticWords,
  setScrollRequest,
  setBackgroundSyncing,
}: UseOnlineWordSubmitParams) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedDraft = useRef('');
  const syncInFlightRef = useRef(0);
  const pendingListenerWordRef = useRef<string | null>(null);
  const activeSubmitProfileRef = useRef<SubmitWordProfile | null>(null);
  const pendingSyncRef = useRef<PendingWordSync[]>([]);
  const flushInFlightRef = useRef(false);

  const finishBackgroundSync = useCallback(() => {
    syncInFlightRef.current = Math.max(0, syncInFlightRef.current - 1);
    const pending = pendingSyncRef.current.length > 0;
    setBackgroundSyncing(syncInFlightRef.current > 0 || pending);
  }, [setBackgroundSyncing]);

  const clearDraftFeedback = useCallback(() => {
    setFeedback(null);
    setFeedbackVariant('default');
  }, [setFeedback, setFeedbackVariant]);

  const removeOptimisticWord = useCallback(
    (normalized: string) => {
      setOptimisticWords((prev) => {
        if (!prev.has(normalized)) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(normalized);
        return next;
      });
    },
    [setOptimisticWords],
  );

  const enqueuePending = useCallback(
    (item: PendingWordSync) => {
      if (pendingSyncRef.current.some((row) => row.normalized === item.normalized)) {
        return;
      }
      pendingSyncRef.current.push(item);
      setBackgroundSyncing(true);
    },
    [setBackgroundSyncing],
  );

  const trySyncWord = useCallback(
    async (
      normalized: string,
      display: string,
      profile?: SubmitWordProfile | null,
    ): Promise<SyncOutcome> => {
      const remote = await submitOnlineWord(
        gameId,
        myUid,
        normalized,
        display,
        uniqueBonusEnabled,
        { profile },
      );
      if (remote.ok) {
        return 'ok';
      }
      return classifySubmitError(remote.error);
    },
    [gameId, myUid, uniqueBonusEnabled],
  );

  const rollbackAcceptedWord = useCallback(
    (
      normalized: string,
      savedDraft: string,
      savedKeyIndices: readonly number[],
      message: string,
      variant: PlayWordFeedbackVariant,
    ) => {
      pendingListenerWordRef.current = null;
      activeSubmitProfileRef.current = null;
      removeOptimisticWord(normalized);
      setDraft(savedDraft);
      setDraftKeyIndices([...savedKeyIndices]);
      lastValidatedDraft.current = '';
      setFeedback(message);
      setFeedbackVariant(variant);
    },
    [removeOptimisticWord, setDraft, setDraftKeyIndices, setFeedback, setFeedbackVariant],
  );

  const runWordSync = useCallback(
    (
      normalized: string,
      display: string,
      profile: SubmitWordProfile | null,
      savedDraft: string,
      savedKeyIndices: readonly number[],
    ) => {
      syncInFlightRef.current += 1;
      setBackgroundSyncing(true);
      pendingListenerWordRef.current = normalized;

      void trySyncWord(normalized, display, profile).then((outcome) => {
        finishBackgroundSync();
        profile?.mark('remoteDone');

        if (outcome === 'ok') {
          lastValidatedDraft.current = '';
          if (myWordsRef.current?.has(normalized)) {
            profile?.mark('listener');
            profile?.finish();
            activeSubmitProfileRef.current = null;
            pendingListenerWordRef.current = null;
          }
          pendingSyncRef.current = pendingSyncRef.current.filter(
            (row) => row.normalized !== normalized,
          );
          return;
        }

        if (outcome === 'duplicate') {
          profile?.finish();
          activeSubmitProfileRef.current = null;
          pendingListenerWordRef.current = null;
          removeOptimisticWord(normalized);
          pendingSyncRef.current = pendingSyncRef.current.filter(
            (row) => row.normalized !== normalized,
          );
          if (!myWordsRef.current?.has(normalized)) {
            setFeedback(t('game.errorAlreadySubmitted'));
            setFeedbackVariant('default');
          }
          return;
        }

        if (outcome === 'retry') {
          profile?.finish();
          activeSubmitProfileRef.current = null;
          pendingListenerWordRef.current = null;
          enqueuePending({ normalized, display });
          lastValidatedDraft.current = '';
          return;
        }

        profile?.finish();
        rollbackAcceptedWord(
          normalized,
          savedDraft,
          savedKeyIndices,
          t('online.errorFirebaseNetwork'),
          'warning',
        );
      });
    },
    [
      enqueuePending,
      finishBackgroundSync,
      myWordsRef,
      removeOptimisticWord,
      rollbackAcceptedWord,
      setBackgroundSyncing,
      setFeedback,
      setFeedbackVariant,
      t,
      trySyncWord,
    ],
  );

  const flushPendingSync = useCallback(async () => {
    if (flushInFlightRef.current || pendingSyncRef.current.length === 0 || !rtdbOnline) {
      return;
    }
    flushInFlightRef.current = true;
    try {
      const queue = [...pendingSyncRef.current];
      for (const item of queue) {
        const outcome = await trySyncWord(item.normalized, item.display);
        if (outcome === 'ok' || outcome === 'duplicate') {
          pendingSyncRef.current = pendingSyncRef.current.filter(
            (row) => row.normalized !== item.normalized,
          );
          if (outcome === 'duplicate') {
            removeOptimisticWord(item.normalized);
          }
          continue;
        }
        if (outcome === 'fatal') {
          pendingSyncRef.current = pendingSyncRef.current.filter(
            (row) => row.normalized !== item.normalized,
          );
          removeOptimisticWord(item.normalized);
        }
      }
    } finally {
      flushInFlightRef.current = false;
      setBackgroundSyncing(syncInFlightRef.current > 0 || pendingSyncRef.current.length > 0);
    }
  }, [removeOptimisticWord, rtdbOnline, setBackgroundSyncing, trySyncWord]);

  useEffect(() => {
    if (!rtdbOnline || session?.status !== 'playing') {
      return;
    }
    void flushPendingSync();
  }, [flushPendingSync, rtdbOnline, session?.status]);

  const submitDraft = useCallback(
    (draftValue: string) => {
      if (
        !session ||
        session.status !== 'playing' ||
        resultsNavigatedRef.current ||
        !roundLexicon ||
        !myUid ||
        draftValue.length === 0
      ) {
        return;
      }
      if (draftValue === lastValidatedDraft.current) {
        return;
      }

      const profile = createSubmitWordProfile(draftValue);
      profile?.mark('debounce');
      activeSubmitProfileRef.current = profile;

      const playerWordsMap = new Map<string, readonly string[]>([
        [myUid, [...wordsForDisplay.keys()]],
      ]);
      const result = acceptWord({
        input: draftValue,
        baseWord: session.baseWord,
        playerId: myUid,
        uniqueBonusEnabled,
        playerWords: playerWordsMap,
        options: {
          minWordLength: 2,
          roundLexicon: roundLexicon.words,
        },
        deps: {
          hasInDictionary: () => false,
        },
        lookupDisplayUpper: (word) => roundLexicon.displays.get(word) ?? toDisplayUpper(word),
      });
      profile?.mark('acceptWord');

      if (!result.accepted || !result.entry) {
        activeSubmitProfileRef.current = null;
        const message = playWordErrorMessage(t, result.error);
        if (message) {
          setFeedback(message);
          setFeedbackVariant(playWordFeedbackVariant(false, result.error));
        }
        return;
      }

      lastValidatedDraft.current = draftValue;
      const savedDraft = draftValue;
      const savedKeyIndices = [...draftKeyIndicesRef.current];
      const display = result.display ?? toDisplayUpper(result.normalized);
      const optimisticWord: StoredPlayerWord = {
        display,
        at: Date.now(),
      };

      setOptimisticWords((prev) => {
        const next = new Map(prev);
        next.set(result.normalized, optimisticWord);
        return next;
      });
      setScrollRequest({ normalized: result.normalized, id: Date.now() });
      setDraft('');
      setDraftKeyIndices([]);
      setFeedback(t('game.wordAccepted'));
      setFeedbackVariant('success');
      playWordAcceptedFeedback(wordAcceptedFeedback);
      profile?.mark('optimisticUi');

      runWordSync(result.normalized, display, profile, savedDraft, savedKeyIndices);
    },
    [
      draftKeyIndicesRef,
      myUid,
      resultsNavigatedRef,
      roundLexicon,
      runWordSync,
      session,
      setDraft,
      setDraftKeyIndices,
      setFeedback,
      setFeedbackVariant,
      setOptimisticWords,
      setScrollRequest,
      t,
      uniqueBonusEnabled,
      wordAcceptedFeedback,
      wordsForDisplay,
    ],
  );

  useEffect(() => {
    if (session?.status !== 'playing') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastValidatedDraft.current = '';
      pendingSyncRef.current = [];
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (draft.length === 0) {
      lastValidatedDraft.current = '';
      return;
    }
    debounceRef.current = setTimeout(() => {
      submitDraft(draft);
    }, VALIDATION_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [draft, session?.status, submitDraft]);

  const pressKey = useCallback(
    (index: number) => {
      if (
        roundEndedRef.current ||
        isPausedRef.current ||
        remainingMsRef.current <= 0 ||
        draftKeyIndicesRef.current.includes(index)
      ) {
        return;
      }
      const key = letterKeys[index];
      if (!key) {
        return;
      }
      setDraft((prev) => prev + key.value);
      setDraftKeyIndices((prev) => [...prev, index]);
      clearDraftFeedback();
    },
    [
      clearDraftFeedback,
      draftKeyIndicesRef,
      isPausedRef,
      letterKeys,
      remainingMsRef,
      roundEndedRef,
      setDraft,
      setDraftKeyIndices,
    ],
  );

  const clearDraft = useCallback(() => {
    setDraft('');
    setDraftKeyIndices([]);
    clearDraftFeedback();
    lastValidatedDraft.current = '';
  }, [clearDraftFeedback, setDraft, setDraftKeyIndices]);

  const backspaceDraft = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
    setDraftKeyIndices((prev) => prev.slice(0, -1));
    clearDraftFeedback();
  }, [clearDraftFeedback, setDraft, setDraftKeyIndices]);

  const onMyWordsUpdated = useCallback(
    (myWords: Map<string, StoredPlayerWord>) => {
      setOptimisticWords((prev) => {
        if (prev.size === 0) {
          return prev;
        }
        let changed = false;
        const next = new Map(prev);
        for (const normalized of prev.keys()) {
          if (myWords.has(normalized)) {
            next.delete(normalized);
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      const pendingWord = pendingListenerWordRef.current;
      if (pendingWord && myWords.has(pendingWord)) {
        activeSubmitProfileRef.current?.mark('listener');
        activeSubmitProfileRef.current?.finish();
        activeSubmitProfileRef.current = null;
        pendingListenerWordRef.current = null;
      }
    },
    [setOptimisticWords],
  );

  return {
    debounceRef,
    pressKey,
    clearDraft,
    backspaceDraft,
    onMyWordsUpdated,
  };
}
