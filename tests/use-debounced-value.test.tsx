// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('а', 100));
    expect(result.current).toBe('а');
  });

  it('updates after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 100), {
      initialProps: { value: 'а' },
    });
    rerender({ value: 'аб' });
    expect(result.current).toBe('а');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('аб');
  });

  it('flushes empty immediately when flushEmpty is set', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100, { flushEmpty: true }),
      { initialProps: { value: 'а' } },
    );
    rerender({ value: '' });
    expect(result.current).toBe('');
  });
});
