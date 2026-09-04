// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GlobalToastHost } from '@/components/GlobalToastHost';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useToastStore, type ToastState } from '@/store/toast-store';

vi.mock('@/hooks/useToastQueue');
vi.mock('@/store/toast-store');
vi.mock('@/components/PlaySessionToast', () => ({
  PlaySessionToastStack: () => null,
}));

describe('GlobalToastHost', () => {
  const mockEnqueueToasts = vi.fn();
  const mockConsumeToasts = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useToastQueue).mockReturnValue({
      toasts: [],
      enqueueToasts: mockEnqueueToasts,
    });
    vi.mocked(useToastStore).mockImplementation((selector) =>
      selector({
        pendingToasts: [],
        consumeToasts: mockConsumeToasts,
      } as unknown as ToastState),
    );
  });

  it('calls enqueueToasts when pendingToasts is not empty', () => {
    const pendingToasts = [{ message: 'test', variant: 'default' }];
    mockConsumeToasts.mockReturnValue(pendingToasts);

    // Mock store to return non-empty pendingToasts
    vi.mocked(useToastStore).mockImplementation((selector) =>
      selector({
        pendingToasts,
        consumeToasts: mockConsumeToasts,
      } as unknown as ToastState),
    );

    render(<GlobalToastHost />);

    expect(mockConsumeToasts).toHaveBeenCalled();
    expect(mockEnqueueToasts).toHaveBeenCalledWith(pendingToasts);
  });

  it('does not call enqueueToasts when pendingToasts is empty', () => {
    mockConsumeToasts.mockReturnValue([]);

    render(<GlobalToastHost />);

    expect(mockConsumeToasts).not.toHaveBeenCalled();
    expect(mockEnqueueToasts).not.toHaveBeenCalled();
  });
});
