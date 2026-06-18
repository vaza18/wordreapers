import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { playButtonFeedback } from '@/lib/feedback/game-feedback';
import { useSettingsStore } from '@/store/settings-store';

interface FeedbackPressableProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  /** When false, no haptic/sound (e.g. modal backdrop). Default true. */
  feedback?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pressable with haptic/sound on touch down (`onPressIn`), with `onPress` fallback on Android.
 */
export function FeedbackPressable({
  feedback = true,
  onPress,
  onPressIn,
  disabled,
  style,
  children,
  ...rest
}: FeedbackPressableProps) {
  const buttonFeedback = useSettingsStore((state) => state.buttonFeedback);
  const didFeedbackRef = useRef(false);

  const fireFeedback = () => {
    if (feedback && !disabled) {
      playButtonFeedback(buttonFeedback);
    }
  };

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    didFeedbackRef.current = true;
    fireFeedback();
    onPressIn?.(event);
  };

  const handlePress: PressableProps['onPress'] = (event) => {
    if (!didFeedbackRef.current) {
      fireFeedback();
    }
    didFeedbackRef.current = false;
    onPress?.(event);
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={style}
      onPressIn={handlePressIn}
      onPress={handlePress}
    >
      {children}
    </Pressable>
  );
}
