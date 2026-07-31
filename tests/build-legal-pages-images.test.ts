import { describe, expect, it } from 'vitest';

import { markdownImageLineToHtml } from '@/lib/legal/markdown-image-line';

describe('markdownImageLineToHtml', () => {
  it('renders a standalone markdown image line', () => {
    expect(markdownImageLineToHtml('![QR](monobank-jar-qr.jpg)')).toBe(
      '<p class="content-image"><img src="monobank-jar-qr.jpg" alt="QR" /></p>',
    );
  });

  it('escapes alt and src for HTML attributes', () => {
    expect(markdownImageLineToHtml('![a "b"](foo"bar.jpg)')).toBe(
      '<p class="content-image"><img src="foo&quot;bar.jpg" alt="a &quot;b&quot;" /></p>',
    );
  });

  it('returns null for non-image lines', () => {
    expect(markdownImageLineToHtml('Hello')).toBeNull();
    expect(markdownImageLineToHtml('[link](https://example.com)')).toBeNull();
    expect(markdownImageLineToHtml('text ![QR](x.jpg) more')).toBeNull();
  });
});
