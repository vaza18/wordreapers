import { DEFAULT_BUTTON_FEEDBACK, type FeedbackMode } from '../settings/feedback-mode.js';

import keyPressSound from '../../assets/generated/sounds/key-press.wav';
import wordAcceptedSound from '../../assets/generated/sounds/word-accepted.wav';

type SoundPlayer = {
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
  volume: number;
};

type HapticsModule = typeof import('expo-haptics');
type AudioModule = typeof import('expo-audio');

let hapticsModule: HapticsModule | null = null;
let hapticsUnavailable = false;
let hapticsWarmupStarted = false;

let keyPlayer: SoundPlayer | null = null;
let wordPlayer: SoundPlayer | null = null;
let audioReady = false;
let audioUnavailable = false;

function wantsVibration(mode: FeedbackMode): boolean {
  return mode === 'vibration' || mode === 'both';
}

function wantsSound(mode: FeedbackMode): boolean {
  return mode === 'sound' || mode === 'both';
}

function loadHapticsModule(): HapticsModule | null {
  if (hapticsUnavailable) {
    return null;
  }
  if (hapticsModule) {
    return hapticsModule;
  }
  try {
    // Deferred require keeps dev client usable when the native module is missing in some builds.
    hapticsModule = require('expo-haptics') as HapticsModule;
    return hapticsModule;
  } catch {
    hapticsUnavailable = true;
    return null;
  }
}

function loadAudioModule(): AudioModule | null {
  if (audioUnavailable) {
    return null;
  }
  try {
    return require('expo-audio') as AudioModule;
  } catch {
    audioUnavailable = true;
    return null;
  }
}

async function ensureAudioPlayers(): Promise<void> {
  if (audioReady || audioUnavailable) {
    return;
  }
  const audio = loadAudioModule();
  if (!audio) {
    return;
  }
  try {
    await audio.setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
    keyPlayer = audio.createAudioPlayer(keyPressSound);
    wordPlayer = audio.createAudioPlayer(wordAcceptedSound);
    keyPlayer.volume = 0.55;
    wordPlayer.volume = 0.7;
    audioReady = true;
  } catch {
    audioUnavailable = true;
    keyPlayer = null;
    wordPlayer = null;
  }
}

/**
 * Preload haptics/audio at startup so the first tap is not delayed.
 */
export function warmUpFeedbackModules(): void {
  if (hapticsWarmupStarted) {
    return;
  }
  hapticsWarmupStarted = true;
  loadHapticsModule();
  void ensureAudioPlayers().then(() => {
    if (keyPlayer) {
      void keyPlayer.seekTo(0);
    }
    if (wordPlayer) {
      void wordPlayer.seekTo(0);
    }
  });
}

/** Fire haptic on touch down (Medium — selection was too faint on iOS). */
function fireButtonHaptic(): void {
  const Haptics = hapticsModule ?? loadHapticsModule();
  if (!Haptics) {
    return;
  }
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Ignore when haptics are disabled.
  }
}

function fireWordHaptic(): void {
  const Haptics = hapticsModule ?? loadHapticsModule();
  if (!Haptics) {
    return;
  }
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Ignore when unavailable.
  }
}

function fireTimerHaptic(): void {
  const Haptics = hapticsModule ?? loadHapticsModule();
  if (!Haptics) {
    return;
  }
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Ignore when unavailable.
  }
}

function playButtonSound(): void {
  if (!audioReady) {
    void ensureAudioPlayers().then(() => {
      playButtonSoundNow();
    });
    return;
  }
  playButtonSoundNow();
}

function playButtonSoundNow(): void {
  if (!keyPlayer) {
    return;
  }
  try {
    void keyPlayer.seekTo(0);
    keyPlayer.play();
  } catch {
    // Ignore playback errors.
  }
}

function playWordSound(): void {
  if (!audioReady) {
    void ensureAudioPlayers().then(() => {
      playWordSoundNow();
    });
    return;
  }
  playWordSoundNow();
}

function playWordSoundNow(): void {
  if (!wordPlayer) {
    return;
  }
  try {
    void wordPlayer.seekTo(0);
    wordPlayer.play();
  } catch {
    // Ignore playback errors.
  }
}

/**
 * UI button / control tap (menus, navigation, letter keys, steppers, etc.).
 */
export function playButtonFeedback(mode: FeedbackMode = DEFAULT_BUTTON_FEEDBACK): void {
  if (mode === 'none') {
    return;
  }
  if (wantsVibration(mode)) {
    fireButtonHaptic();
  }
  if (wantsSound(mode)) {
    playButtonSound();
  }
}

/** @deprecated Use {@link playButtonFeedback}. */
export const playKeyPressFeedback = playButtonFeedback;

/**
 * Positive feedback when a word is accepted.
 */
export function playWordAcceptedFeedback(mode: FeedbackMode): void {
  if (mode === 'none') {
    return;
  }
  if (wantsVibration(mode)) {
    fireWordHaptic();
  }
  if (wantsSound(mode)) {
    playWordSound();
  }
}

/**
 * Timer countdown alerts (60s, 10s, final seconds).
 */
export function playTimerAlert(mode: FeedbackMode): void {
  if (mode === 'none') {
    return;
  }
  if (wantsVibration(mode)) {
    fireTimerHaptic();
  }
  if (wantsSound(mode)) {
    playWordSound();
  }
}

/**
 * Wrap a press handler with configured button feedback (feedback runs first).
 */
export function withButtonFeedback(mode: FeedbackMode, onPress: () => void): () => void {
  return () => {
    playButtonFeedback(mode);
    onPress();
  };
}
