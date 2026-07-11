import AsyncStorage from '@react-native-async-storage/async-storage';

import { wordsNeeded } from '@/lib/game/solo-round-success';

const TRAINING_MILESTONE_KEY = 'wordreapers.hasCompletedTrainingRound';

/**
 * True when the player reached «Гарний темп» in a solo training round:
 * `wordCount >= min(ceil(0.05 * lexiconMax), 25)`.
 */
export function meetsTrainingMilestone(wordCount: number, lexiconMaxCount: number): boolean {
  if (lexiconMaxCount <= 0 || wordCount <= 0) {
    return false;
  }
  return wordCount >= trainingWordsRequired(lexiconMaxCount);
}

/**
 * Words required to unlock multiplayer — same as `wordsNeeded('goodPace', lexiconMax)`.
 */
export function trainingWordsRequired(lexiconMaxCount: number): number {
  return wordsNeeded('goodPace', lexiconMaxCount);
}

/** Words still needed to unlock multiplayer during training. */
export function wordsUntilTrainingUnlock(wordCount: number, lexiconMaxCount: number): number {
  return Math.max(0, trainingWordsRequired(lexiconMaxCount) - wordCount);
}

/** Whether solo training milestone was completed on this device. */
export async function getHasCompletedTrainingRound(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(TRAINING_MILESTONE_KEY);
  return raw === '1';
}

/** Mark training milestone complete after a qualifying solo round. */
export async function markTrainingRoundCompleted(): Promise<void> {
  await AsyncStorage.setItem(TRAINING_MILESTONE_KEY, '1');
}
