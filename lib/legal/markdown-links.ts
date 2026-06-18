/** Slug for `#anchor` links — matches headings in bundled about/legal markdown. */
export function markdownHeadingSlug(title: string): string {
  return title
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '');
}

const INTERNAL_MARKDOWN_ROUTES: Record<string, string> = {
  'legal/uk-uk/open_source.md': '/opensource',
  'legal/uk-uk/privacy_policy.md': '/privacy',
  'legal/uk-uk/terms_of_use.md': '/terms',
  'open_source.md': '/opensource',
  'privacy_policy.md': '/privacy',
  'terms_of_use.md': '/terms',
};

/** Resolved in-app navigation target for a markdown href. */
export type MarkdownLinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'internal'; pathname: string }
  | { kind: 'external'; url: string };

/**
 * Normalize hrefs from markdown-it / react-native Linking resolution.
 */
export function parseMarkdownLinkTarget(href: string): MarkdownLinkTarget | null {
  const decoded = decodeURIComponent(href);

  if (decoded.startsWith('#')) {
    return { kind: 'anchor', id: decoded.slice(1) };
  }

  const hashOnly = decoded.match(/%23([^/]+)$/) ?? decoded.match(/#([^/]+)$/);
  if (hashOnly) {
    return { kind: 'anchor', id: decodeURIComponent(hashOnly[1]) };
  }

  if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
    return { kind: 'external', url: decoded };
  }

  const normalizedPath = decoded.replace(/^file:\/\/.*?\.app\//, '').replace(/^\//, '');

  const internalRoute = INTERNAL_MARKDOWN_ROUTES[normalizedPath];
  if (internalRoute) {
    return { kind: 'internal', pathname: internalRoute };
  }

  return null;
}
