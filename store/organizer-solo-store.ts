import { create } from 'zustand';

import type { ScoredWordEntry, WordScoreBadge, WordScoreKind } from '@/lib/game/scoring';
import { buildStandings, computePlayerScore, resolveUniqueBonusEnabled } from '@/lib/game/scoring';
import { computeRoundPlayedSecondsFromTimerState } from '@/lib/game/round-duration';
import type { LocalRoomSetup } from '@/lib/online/local-room-draft';
import { computeExtendedTimerEndsAt } from '@/lib/online/voting/add-time-vote';

export interface OrganizerSoloWord {
  normalized: string;
  display: string;
  kind: WordScoreKind;
  points: number;
  badge: WordScoreBadge;
  at: number;
}

export interface OrganizerSoloState {
  draftId: string;
  setup: LocalRoomSetup | null;
  uniqueBonusEnabled: boolean;
  endsAt: number | null;
  /** Wall-clock moment the round ended (results/archive). */
  finishedAt: number | null;
  /** Countdown remaining when the round ended (frozen for the header). */
  finishedRemainingMs: number | null;
  pausedRemainingMs: number | null;
  roundTimerBudgetSeconds: number | null;
  roundPlayedSeconds: number | null;
  status: 'idle' | 'playing' | 'paused' | 'finished';
  words: OrganizerSoloWord[];
  published: boolean;
  initFromSetup: (draftId: string, setup: LocalRoomSetup) => void;
  startRound: () => void;
  appendWord: (word: OrganizerSoloWord) => void;
  finishRound: () => void;
  pauseRound: () => void;
  resumeRound: () => void;
  addTime: (minutes: number) => void;
  markPublished: () => void;
  clear: () => void;
  getScoredWords: () => ScoredWordEntry[];
  getScore: () => number;
  getRemainingMs: (now: number) => number;
}

const initialState = {
  draftId: '',
  setup: null as LocalRoomSetup | null,
  uniqueBonusEnabled: false,
  endsAt: null as number | null,
  finishedAt: null as number | null,
  finishedRemainingMs: null as number | null,
  pausedRemainingMs: null as number | null,
  roundTimerBudgetSeconds: null as number | null,
  roundPlayedSeconds: null as number | null,
  status: 'idle' as const,
  words: [] as OrganizerSoloWord[],
  published: false,
};

export const useOrganizerSoloStore = create<OrganizerSoloState>((set, get) => ({
  ...initialState,

  initFromSetup: (draftId, setup) => {
    set({
      ...initialState,
      draftId,
      setup,
      uniqueBonusEnabled: resolveUniqueBonusEnabled(setup.uniqueBonusMode, 1),
    });
  },

  startRound: () => {
    const { setup } = get();
    if (!setup) {
      return;
    }
    const durationMs = setup.durationMinutes * 60_000;
    set({
      endsAt: Date.now() + durationMs,
      pausedRemainingMs: null,
      roundTimerBudgetSeconds: setup.durationMinutes * 60,
      roundPlayedSeconds: null,
      status: 'playing',
      words: [],
    });
  },

  appendWord: (word) => {
    set((state) => ({
      words: [...state.words, word],
    }));
  },

  finishRound: () => {
    const state = get();
    const now = Date.now();
    const remainingMs = state.getRemainingMs(now);
    const budget = state.roundTimerBudgetSeconds ?? (state.setup?.durationMinutes ?? 0) * 60;
    const roundPlayedSeconds = computeRoundPlayedSecondsFromTimerState({
      budgetSeconds: budget,
      remainingMs,
    });
    set({
      status: 'finished',
      endsAt: null,
      finishedAt: now,
      finishedRemainingMs: remainingMs,
      pausedRemainingMs: null,
      roundPlayedSeconds,
    });
  },

  pauseRound: () => {
    const { endsAt, status } = get();
    if (status !== 'playing' || endsAt === null) {
      return;
    }
    set({
      status: 'paused',
      pausedRemainingMs: Math.max(0, endsAt - Date.now()),
      endsAt: null,
    });
  },

  resumeRound: () => {
    const { pausedRemainingMs, status } = get();
    if (status !== 'paused' || pausedRemainingMs === null) {
      return;
    }
    set({
      status: 'playing',
      endsAt: Date.now() + pausedRemainingMs,
      pausedRemainingMs: null,
    });
  },

  addTime: (minutes) => {
    const { status, endsAt, pausedRemainingMs, roundTimerBudgetSeconds } = get();
    const addMs = minutes * 60_000;
    const addSeconds = minutes * 60;
    if (status === 'playing' && endsAt !== null) {
      set({
        endsAt: computeExtendedTimerEndsAt(endsAt, minutes, Date.now()),
        roundTimerBudgetSeconds: (roundTimerBudgetSeconds ?? 0) + addSeconds,
      });
      return;
    }
    if (status === 'paused' && pausedRemainingMs !== null) {
      set({
        pausedRemainingMs: pausedRemainingMs + addMs,
        roundTimerBudgetSeconds: (roundTimerBudgetSeconds ?? 0) + addSeconds,
      });
    }
  },

  markPublished: () => {
    set({ published: true });
  },

  clear: () => {
    set({ ...initialState, setup: null });
  },

  getScoredWords: () => {
    const { words } = get();
    return words.map((word) => ({
      normalized: word.normalized,
      kind: word.kind,
      points: word.points,
      badge: word.badge,
    }));
  },

  getScore: () => computePlayerScore(get().getScoredWords()),

  getRemainingMs: (now) => {
    const { status, endsAt, pausedRemainingMs, finishedRemainingMs } = get();
    if (status === 'finished') {
      return finishedRemainingMs ?? 0;
    }
    if (status === 'paused' && pausedRemainingMs !== null) {
      return pausedRemainingMs;
    }
    if (endsAt === null) {
      return 0;
    }
    return Math.max(0, endsAt - now);
  },
}));

export function organizerSoloSnapshotForPublish(state: OrganizerSoloState): {
  words: OrganizerSoloWord[];
  score: number;
  wordCount: number;
  remainingMs: number;
  paused: boolean;
  roundTimerBudgetSeconds: number | undefined;
} {
  const now = Date.now();
  return {
    words: state.words,
    score: state.getScore(),
    wordCount: state.words.length,
    remainingMs: state.getRemainingMs(now),
    paused: state.status === 'paused',
    roundTimerBudgetSeconds: state.roundTimerBudgetSeconds ?? undefined,
  };
}

export function organizerSoloStandings(state: OrganizerSoloState) {
  const map = new Map<string, readonly string[]>([['solo', state.words.map((w) => w.normalized)]]);
  return buildStandings(map, state.uniqueBonusEnabled);
}
