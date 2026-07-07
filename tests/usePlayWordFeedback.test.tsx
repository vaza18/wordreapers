// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PLAY_WORD_FEEDBACK_DISMISS_MS,
  usePlayWordFeedbackDismiss,
} from '../hooks/usePlayWordFeedback.js';

describe('usePlayWordFeedbackDismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses success feedback after timeout', () => {
    const clearFeedback = vi.fn();
    renderHook(() => usePlayWordFeedbackDismiss('Слово зараховано', 'success', clearFeedback));

    act(() => {
      vi.advanceTimersByTime(PLAY_WORD_FEEDBACK_DISMISS_MS - 1);
    });
    expect(clearFeedback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(clearFeedback).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss validation error feedback', () => {
    const clearFeedback = vi.fn();
    renderHook(() => usePlayWordFeedbackDismiss('Немає в словнику', 'warning', clearFeedback));

    act(() => {
      vi.advanceTimersByTime(PLAY_WORD_FEEDBACK_DISMISS_MS * 2);
    });
    expect(clearFeedback).not.toHaveBeenCalled();
  });

  it('does not auto-dismiss default feedback', () => {
    const clearFeedback = vi.fn();
    renderHook(() => usePlayWordFeedbackDismiss('Слово вже зараховано', 'default', clearFeedback));

    act(() => {
      vi.advanceTimersByTime(PLAY_WORD_FEEDBACK_DISMISS_MS * 2);
    });
    expect(clearFeedback).not.toHaveBeenCalled();
  });
});
