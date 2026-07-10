// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const setPreventRemove = vi.fn();
const beforeRemoveHandlers: Array<
  (event: { data: { action: { type: string } }; preventDefault: () => void }) => void
> = [];

const addListener = vi.fn((event: string, handler: (typeof beforeRemoveHandlers)[number]) => {
  if (event === 'beforeRemove') {
    beforeRemoveHandlers.push(handler);
  }
  return () => {
    const index = beforeRemoveHandlers.indexOf(handler);
    if (index >= 0) {
      beforeRemoveHandlers.splice(index, 1);
    }
  };
});

vi.mock('expo-router/react-navigation', () => ({
  useNavigation: () => ({ addListener }),
  useRoute: () => ({ key: 'route-setup' }),
  usePreventRemoveContext: () => ({
    setPreventRemove,
    preventedRoutes: {},
  }),
}));

import { useSyncedStackBack } from '../hooks/useSyncedStackBack';

function HookHost({ onBack }: { onBack: () => void }) {
  const runBack = useSyncedStackBack(onBack);
  return (
    <button type="button" onClick={runBack}>
      back
    </button>
  );
}

describe('useSyncedStackBack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beforeRemoveHandlers.length = 0;
  });

  it('registers native prevent-remove for the route', () => {
    render(<HookHost onBack={vi.fn()} />);

    expect(setPreventRemove).toHaveBeenCalledWith(expect.any(String), 'route-setup', true);
    expect(beforeRemoveHandlers).toHaveLength(1);
  });

  it('runs the handler and prevents default on stack back actions', () => {
    const onBack = vi.fn();
    render(<HookHost onBack={onBack} />);

    const preventDefault = vi.fn();
    beforeRemoveHandlers[0]?.({
      data: { action: { type: 'GO_BACK' } },
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('allows programmatic navigation actions through', () => {
    const onBack = vi.fn();
    render(<HookHost onBack={onBack} />);

    const preventDefault = vi.fn();
    beforeRemoveHandlers[0]?.({
      data: { action: { type: 'REPLACE' } },
      preventDefault,
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('clears prevent-remove on unmount', () => {
    const { unmount } = render(<HookHost onBack={vi.fn()} />);
    unmount();

    expect(setPreventRemove).toHaveBeenLastCalledWith(expect.any(String), 'route-setup', false);
  });
});
