// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BASE_WORD_SUGGEST_BLUR_MS,
  BASE_WORD_SUGGEST_IGNORE_CHANGE_MS,
} from '../constants/base-word-suggest.js';

vi.mock('react-native', async () => {
  const actual = await vi.importActual<typeof import('react-native')>('react-native');
  return {
    ...actual,
    Keyboard: {
      dismiss: vi.fn(),
    },
  };
});

import { useBaseWordSuggestField } from '../hooks/useBaseWordSuggestField.js';

function renderSuggestField(initialInput = 'СУПЕРКОН') {
  let baseWordInput = initialInput;
  let commitMode: 'typing' | 'immediate' = 'typing';
  let focused = true;

  const hook = renderHook(
    ({ input }: { input: string }) =>
      useBaseWordSuggestField({
        baseWordInput: input,
        setBaseWordInput: (value) => {
          baseWordInput = value;
        },
        setLexiconCommitMode: (mode) => {
          commitMode = mode;
        },
        setBaseWordFocused: (value) => {
          focused = value;
        },
      }),
    { initialProps: { input: initialInput } },
  );

  const syncInputProp = () => {
    hook.rerender({ input: baseWordInput });
  };

  return {
    result: hook.result,
    syncInputProp,
    get baseWordInput() {
      return baseWordInput;
    },
    get commitMode() {
      return commitMode;
    },
    get focused() {
      return focused;
    },
  };
}

describe('useBaseWordSuggestField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores onChangeText briefly after commitBaseWordDisplay', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.commitBaseWordDisplay('СУПЕРКОНДЕНСАТОР');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('СУПЕРКОНДЕНСАТОР');
    expect(field.commitMode).toBe('immediate');
    expect(field.focused).toBe(false);

    act(() => {
      field.result.current.onChangeText('СУПЕРКОН');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('СУПЕРКОНДЕНСАТОР');

    act(() => {
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_IGNORE_CHANGE_MS - 1);
      field.result.current.onChangeText('ЩЕ');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('СУПЕРКОНДЕНСАТОР');

    act(() => {
      vi.advanceTimersByTime(1);
      field.result.current.onChangeText('ІНШЕ');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('ІНШЕ');
    expect(field.commitMode).toBe('typing');
  });

  it('commits lexicon immediately on blur; hides dropdown after delay', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onBlur();
    });
    expect(field.commitMode).toBe('immediate');
    expect(field.focused).toBe(true);

    act(() => {
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(false);
  });

  it('blur with a short word does not set immediate', () => {
    const field = renderSuggestField('АБВ');

    act(() => {
      field.result.current.onBlur();
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.commitMode).toBe('typing');
    expect(field.focused).toBe(false);
  });

  it('onTouchSelectStart suppresses blur hide so select can finish, but still commits lexicon', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onTouchSelectStart();
      field.result.current.onBlur();
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(true);
    expect(field.commitMode).toBe('immediate');

    act(() => {
      field.result.current.commitBaseWordDisplay('СУПЕРКОНДЕНСАТОР');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('СУПЕРКОНДЕНСАТОР');
    expect(field.commitMode).toBe('immediate');
  });

  it('cancelled pressIn (deferred pressOut) does not poison later blur', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onTouchSelectStart();
      field.result.current.onTouchSelectEnd();
      vi.advanceTimersByTime(0);
      field.result.current.onBlur();
    });
    expect(field.commitMode).toBe('immediate');
    expect(field.focused).toBe(true);

    act(() => {
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(false);
  });

  it('pressOut then blur before press still suppresses hide until commit', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onTouchSelectStart();
      field.result.current.onTouchSelectEnd();
      // Do not flush the deferred clear — blur must still see suppress=true.
      field.result.current.onBlur();
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(true);
    expect(field.commitMode).toBe('immediate');

    act(() => {
      field.result.current.commitBaseWordDisplay('СУПЕРКОНДЕНСАТОР');
      field.syncInputProp();
      vi.advanceTimersByTime(0);
    });
    expect(field.baseWordInput).toBe('СУПЕРКОНДЕНСАТОР');
    expect(field.focused).toBe(false);
  });

  it('suppress auto-expires if pressIn never ends', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onTouchSelectStart();
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
      field.result.current.onBlur();
    });
    expect(field.commitMode).toBe('immediate');
  });

  it('after select gesture, a later blur still hides and sets immediate', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onTouchSelectStart();
      field.result.current.onBlur();
      field.result.current.commitBaseWordDisplay('СУПЕРКОНДЕНСАТОР');
      field.syncInputProp();
    });
    expect(field.focused).toBe(false);
    expect(field.commitMode).toBe('immediate');

    act(() => {
      field.result.current.onFocus();
      field.result.current.onChangeText('СУПЕРКОН');
      field.syncInputProp();
    });
    expect(field.focused).toBe(true);
    expect(field.commitMode).toBe('typing');

    act(() => {
      field.result.current.onBlur();
    });
    expect(field.commitMode).toBe('immediate');
    expect(field.focused).toBe(true);

    act(() => {
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(false);
  });

  it('onFocus cancels a pending dropdown-hide timer', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.onBlur();
    });
    expect(field.commitMode).toBe('immediate');

    act(() => {
      field.result.current.onFocus();
      vi.advanceTimersByTime(BASE_WORD_SUGGEST_BLUR_MS);
    });
    expect(field.focused).toBe(true);
  });

  it('onFocus clears ignore so typing works right after select', () => {
    const field = renderSuggestField();

    act(() => {
      field.result.current.commitBaseWordDisplay('СУПЕРКОНДЕНСАТОР');
      field.syncInputProp();
      field.result.current.onFocus();
      field.result.current.onChangeText('СУПЕРКОН');
      field.syncInputProp();
    });
    expect(field.baseWordInput).toBe('СУПЕРКОН');
    expect(field.commitMode).toBe('typing');
  });
});
