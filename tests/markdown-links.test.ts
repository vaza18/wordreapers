import { describe, expect, it } from 'vitest';

import { markdownHeadingSlug, parseMarkdownLinkTarget } from '@/lib/legal/markdown-links';

describe('markdownHeadingSlug', () => {
  it('slugifies Ukrainian headings for in-document anchors', () => {
    expect(markdownHeadingSlug('Про гру')).toBe('про-гру');
    expect(markdownHeadingSlug('Правила гри')).toBe('правила-гри');
    expect(markdownHeadingSlug('Юридична інформація')).toBe('юридична-інформація');
    expect(markdownHeadingSlug('Автори')).toBe('автори');
    expect(markdownHeadingSlug('Використання ШІ при розробці')).toBe(
      'використання-ші-при-розробці',
    );
  });
});

describe('parseMarkdownLinkTarget', () => {
  it('parses hash-only anchors', () => {
    expect(parseMarkdownLinkTarget('#правила-гри')).toEqual({
      kind: 'anchor',
      id: 'правила-гри',
    });
  });

  it('parses file URLs that Linking resolves for hash links', () => {
    expect(
      parseMarkdownLinkTarget(
        'file:///var/app/Slovozbirachi.app/%23%D0%BF%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0-%D0%B3%D1%80%D0%B8',
      ),
    ).toEqual({
      kind: 'anchor',
      id: 'правила-гри',
    });
  });

  it('maps bundled legal markdown paths to in-app routes', () => {
    expect(parseMarkdownLinkTarget('legal/uk-uk/privacy_policy.md')).toEqual({
      kind: 'internal',
      pathname: '/privacy',
    });
    expect(parseMarkdownLinkTarget('terms_of_use.md')).toEqual({
      kind: 'internal',
      pathname: '/terms',
    });
  });
});
