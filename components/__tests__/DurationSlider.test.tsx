// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import {
  DurationSlider,
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
} from '@/components/DurationSlider';
import { renderWithTheme, screen } from '@/tests/helpers/render-with-theme';

describe('DurationSlider', () => {
  it('exposes duration bounds and renders the current value', () => {
    expect(DURATION_MIN_MINUTES).toBe(5);
    expect(DURATION_MAX_MINUTES).toBe(20);

    renderWithTheme(
      <DurationSlider label="Тривалість" value={10} onChange={vi.fn()} valueSuffix=" хв" />,
    );

    expect(screen.getByLabelText('Тривалість')).toBeTruthy();
    expect(screen.getByText('10 хв')).toBeTruthy();
  });
});
