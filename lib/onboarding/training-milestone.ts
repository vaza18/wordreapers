import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRAINING_MILESTONE_LEXICON_RATIO = 0.05;

const TRAINING_MILESTONE_KEY = 'wordreapers.hasCompletedTrainingRound';

/** True when the player found more than 5% of the round lexicon in a solo training round. */
export function meetsTrainingMilestone(wordCount: number, lexiconMaxCount: number): boolean {
  if (lexiconMaxCount <= 0 || wordCount <= 0) {
    return false;
  }
  return wordCount > lexiconMaxCount * TRAINING_MILESTONE_LEXICON_RATIO;
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
