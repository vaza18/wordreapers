// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from '@/components/SegmentedControl';
import { fireEvent, renderWithTheme, screen } from '@/tests/helpers/render-with-theme';

describe('SegmentedControl', () => {
  it('selects a new option when pressed', () => {
    const onChange = vi.fn();

    renderWithTheme(
      <SegmentedControl
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
