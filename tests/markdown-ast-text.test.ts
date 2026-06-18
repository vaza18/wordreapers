import { describe, expect, it } from 'vitest';

import { markdownAstPlainText } from '@/lib/legal/markdown-ast-text';
import { markdownHeadingSlug } from '@/lib/legal/markdown-links';

describe('markdownAstPlainText', () => {
  it('reads heading text from nested AST children', () => {
    const title = markdownAstPlainText({
      children: [{ content: 'Правила ' }, { content: 'гри' }],
    });
    expect(title).toBe('Правила гри');
    expect(markdownHeadingSlug(title)).toBe('правила-гри');
  });
});
