// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { Animated } from 'react-native';
import { describe, expect, it } from 'vitest';

import { DraftLetterFlyOverlay } from '@/components/DraftLetterFlyOverlay';

describe('DraftLetterFlyOverlay', () => {
  it('puts pointerEvents none on a View host so Text cannot steal taps under the ghost', () => {
    const flyPosition = new Animated.ValueXY({ x: 12, y: 40 });
    const flyScale = new Animated.Value(1);

    render(
      <DraftLetterFlyOverlay
        flyLetter="А"
        flyPosition={flyPosition}
        flyScale={flyScale}
        fontSize={22}
        lineHeight={28}
        letterSpacing={1}
        style={{ fontWeight: '600' }}
      />,
    );

    const letter = screen.getByText('А');
    const host = letter.parentElement;

    // FIX target: pointerEvents on Text is ignored on Android — host View must own it.
    expect(host).not.toBeNull();
    expect(host).not.toBe(letter);
    expect(getComputedStyle(host!).pointerEvents).toBe('none');
  });
});
