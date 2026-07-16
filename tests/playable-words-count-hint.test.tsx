// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#0a0',
      textSecondary: '#666',
    },
  }),
}));

vi.mock('@/hooks/useThemedStyles', () => ({
  useThemedStyles: (factory: (colors: Record<string, string>) => object) =>
    factory({
      accent: '#0a0',
      textSecondary: '#666',
    }),
}));

import { PlayableWordsCountHint } from '../components/PlayableWordsCountHint.js';

describe('PlayableWordsCountHint', () => {
  it('asks to choose a base word when empty or too short', () => {
    const { rerender } = render(<PlayableWordsCountHint status="empty" maxCount={null} />);
    expect(screen.getByText('game.playableWordsNeedBaseWord')).toBeTruthy();

    rerender(<PlayableWordsCountHint status="tooShort" maxCount={null} />);
    expect(screen.getByText('game.playableWordsNeedBaseWord')).toBeTruthy();
  });

  it('does not show need-base-word copy while typing a long word (pending)', () => {
    render(<PlayableWordsCountHint status="pending" maxCount={null} />);
    expect(screen.queryByText('game.playableWordsNeedBaseWord')).toBeNull();
    expect(screen.queryByText('game.playableWordsLoading')).toBeNull();
  });
});
