import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

afterEach(() => {
  cleanup();
});

vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: vi.fn(() => null),
  requireNativeModule: vi.fn(() => ({})),
  EventEmitter: class {
    addListener = vi.fn();
    removeAllListeners = vi.fn();
  },
}));

vi.mock('@/lib/feedback/game-feedback', () => ({
  playButtonFeedback: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
