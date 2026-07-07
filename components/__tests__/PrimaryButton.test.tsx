// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { PrimaryButton } from '@/components/PrimaryButton';
import { fireEvent, renderWithTheme, screen } from '@/tests/helpers/render-with-theme';

describe('PrimaryButton', () => {
  it('renders the label and handles press', () => {
    const onPress = vi.fn();

    renderWithTheme(<PrimaryButton label="Грати" onPress={onPress} />);

    fireEvent.click(screen.getByRole('button', { name: 'Грати' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sets disabled on the pressable when disabled', () => {
    const onPress = vi.fn();

    renderWithTheme(<PrimaryButton label="Грати" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Грати' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});
