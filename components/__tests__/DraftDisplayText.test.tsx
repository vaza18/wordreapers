// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { DraftDisplayText } from '@/components/DraftDisplayText';
import { renderWithTheme, screen } from '@/tests/helpers/render-with-theme';

describe('DraftDisplayText', () => {
  it('hides revealing glyphs with the Android-safe transparent color', () => {
    renderWithTheme(
      <DraftDisplayText
        display="АБ"
        isCharRevealing={(index) => index === 1}
        revealVersion={1}
        onTextLayout={vi.fn()}
        style={{ color: '#112233' }}
        fontSize={24}
        height={40}
      />,
    );

    const hidden = screen.getByText('Б') as HTMLElement;
    // RN-web expands #FFFFFF00 → rgba(255, 255, 255, 0.00)
    expect(hidden.style.color).toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0(?:\.0+)?\s*\)/);
  });
});
