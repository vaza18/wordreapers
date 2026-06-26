import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storage } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return { storage };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
  },
}));

import { getHasSeenHowToPlay, markHowToPlaySeen } from '@/lib/onboarding/how-to-play';
import {
  getHasCompletedTrainingRound,
  markTrainingRoundCompleted,
} from '@/lib/onboarding/training-milestone';

describe('onboarding AsyncStorage flags', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('tracks how-to-play seen flag', async () => {
    expect(await getHasSeenHowToPlay()).toBe(false);
    await markHowToPlaySeen();
    expect(await getHasSeenHowToPlay()).toBe(true);
  });

  it('tracks training milestone flag', async () => {
    expect(await getHasCompletedTrainingRound()).toBe(false);
    await markTrainingRoundCompleted();
    expect(await getHasCompletedTrainingRound()).toBe(true);
  });
});
