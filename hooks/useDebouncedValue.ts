import { useEffect, useState } from 'react';

export type UseDebouncedValueOptions = {
  /** When true, empty string / nullish values apply immediately (skip delay). */
  flushEmpty?: boolean;
};

/**
 * Timer debounce for non-urgent UI (e.g. word-list draft prefix). Prefer this over
 * `useDeferredValue` for draft-adjacent RN/iOS UI.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  options: UseDebouncedValueOptions = {},
): T {
  const { flushEmpty = false } = options;
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (flushEmpty && (value === '' || value == null)) {
      setDebounced(value);
      return;
    }

    const id = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(id);
    };
  }, [delayMs, flushEmpty, value]);

  return debounced;
}
