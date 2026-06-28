import React, { forwardRef } from 'react';
import { useWindowDimensions } from 'react-native';
import type {
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from 'react-native';

import { getMaxPlayableFontScale } from './font-scale';

let installed = false;

type ReactNativeModule = typeof import('react-native');

function wrapText(Original: typeof RNText): typeof RNText {
  const Wrapped = forwardRef<RNText, TextProps>(function AccessibleText(props, ref) {
    const { width } = useWindowDimensions();
    const cappedScale = getMaxPlayableFontScale(width);
    const { allowFontScaling = true, maxFontSizeMultiplier = cappedScale, ...rest } = props;

    return React.createElement(Original, {
      ref,
      allowFontScaling,
      maxFontSizeMultiplier,
      ...rest,
    });
  });
  Wrapped.displayName = 'Text';
  return Wrapped as unknown as typeof RNText;
}

function wrapTextInput(Original: typeof RNTextInput): typeof RNTextInput {
  const Wrapped = forwardRef<RNTextInput, TextInputProps>(function AccessibleTextInput(props, ref) {
    const { width } = useWindowDimensions();
    const cappedScale = getMaxPlayableFontScale(width);
    const { allowFontScaling = true, maxFontSizeMultiplier = cappedScale, ...rest } = props;

    return React.createElement(Original, {
      ref,
      allowFontScaling,
      maxFontSizeMultiplier,
      ...rest,
    });
  });
  Wrapped.displayName = 'TextInput';
  Object.assign(Wrapped, { State: Original.State });
  return Wrapped as unknown as typeof RNTextInput;
}

/**
 * Cap native Dynamic Type on Text/TextInput; fontSize comes from styles, iOS/Android scale it.
 * Patches react-native exports (defaultProps no longer work on RN 0.81 + React 19).
 */
export function enableAccessibleTypography(): void {
  if (installed) {
    return;
  }
  installed = true;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reactNative = require('react-native') as ReactNativeModule;
  const patchedText = wrapText(reactNative.Text);
  const patchedTextInput = wrapTextInput(reactNative.TextInput);

  Object.defineProperty(reactNative, 'Text', {
    enumerable: true,
    configurable: true,
    get: () => patchedText,
  });
  Object.defineProperty(reactNative, 'TextInput', {
    enumerable: true,
    configurable: true,
    get: () => patchedTextInput,
  });
}
