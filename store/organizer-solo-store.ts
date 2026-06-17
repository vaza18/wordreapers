import { create } from 'zustand';

import type { ScoredWordEntry, WordScoreBadge, WordScoreKind } from '@/lib/game/scoring';
import { buildStandings, computePlayerScore, resolveUniqueBonusEnabled } from '@/lib/game/scoring';
import type { LocalRoomSetup } from '@/lib/online/local-room-draft';

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
  pausedRemainingMs: number | null;
  status: 'idle' | 'playing' | 'paused' | 'finished';
  words: OrganizerSoloWord[];
  published: boolean;
  initFromSetup: (draftId: string, setup: LocalRoomSetup) => void;
  startRound: () => void;
  appendWord: (word: OrganizerSoloWord) => void;
  finishRound: () => void;
  pauseRound: () => void;
  resumeRound: () => void;
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
  pausedRemainingMs: null as number | null,
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
    set({ status: 'finished', endsAt: Date.now(), pausedRemainingMs: null });
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
    const { status, endsAt, pausedRemainingMs } = get();
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
} {
  const now = Date.now();
  return {
    words: state.words,
    score: state.getScore(),
    wordCount: state.words.length,
    remainingMs: state.getRemainingMs(now),
    paused: state.status === 'paused',
  };
}

export function organizerSoloStandings(state: OrganizerSoloState) {
  const map = new Map<string, readonly string[]>([['solo', state.words.map((w) => w.normalized)]]);
  return buildStandings(map, state.uniqueBonusEnabled);
}
