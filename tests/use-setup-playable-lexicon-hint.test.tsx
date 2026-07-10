// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VALIDATION_DEBOUNCE_MS } from '../constants/game-timing.js';
import { DictionaryIndex } from '../lib/dictionary/dictionary-index.js';
import { clearRoundPlayableLexiconCache } from '../lib/dictionary/round-playable-lexicon-cache.js';
import { resetRoundPlayableLexiconPrefetchForTests } from '../lib/dictionary/round-playable-lexicon-prefetch.js';
import {
  useSetupPlayableLexiconHint,
  type SetupLexiconCommitMode,
} from '../hooks/useSetupPlayableLexiconHint.js';

vi.mock('../lib/app/schedule-idle-work.js', () => ({
  scheduleIdleWork: (task: () => void) => {
    task();
    return () => undefined;
  },
}));

const MAIN = ['компютер', 'мотор', 'порт', 'рот', 'топ'];

vi.mock('../services/dictionary-service.js', () => ({
  loadBundledDictionary: async () => new DictionaryIndex(MAIN, {}),
  loadBundledSupplements: async () => ({ properNouns: [], slang: [] }),
  loadBundledWhitelists: async () => ({
    general: [],
    properNouns: [],
    slang: [],
  }),
}));

type HintHookProps = {
  baseWordInput: string;
  commitMode: SetupLexiconCommitMode;
};

describe('useSetupPlayableLexiconHint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRoundPlayableLexiconCache();
    resetRoundPlayableLexiconPrefetchForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRoundPlayableLexiconPrefetchForTests();
    clearRoundPlayableLexiconCache();
  });

  it('debounces typing before prefetch', async () => {
    const { result, rerender } = renderHook(
      ({ baseWordInput, commitMode }: HintHookProps) =>
        useSetupPlayableLexiconHint({
          baseWordInput,
          allowProperNouns: false,
          allowSlang: false,
          commitMode,
        }),
      { initialProps: { baseWordInput: '', commitMode: 'typing' as SetupLexiconCommitMode } },
    );

    expect(result.current.status).toBe('empty');

    rerender({ baseWordInput: 'КОМПЮТЕР', commitMode: 'typing' });
    expect(result.current.status).not.toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(VALIDATION_DEBOUNCE_MS - 1);
    });
    expect(result.current.status).not.toBe('ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
    });
    expect(result.current.maxCount).toBe(3);
  });

  it('prefetches immediately after select/shuffle commit', async () => {
    const { result, rerender } = renderHook(
      ({ baseWordInput, commitMode }: HintHookProps) =>
        useSetupPlayableLexiconHint({
          baseWordInput,
          allowProperNouns: false,
          allowSlang: false,
          commitMode,
        }),
      { initialProps: { baseWordInput: '', commitMode: 'typing' as SetupLexiconCommitMode } },
    );

    rerender({ baseWordInput: 'КОМПЮТЕР', commitMode: 'immediate' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
    });
    expect(result.current.maxCount).toBe(3);
  });
});
