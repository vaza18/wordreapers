import { Linking } from 'react-native';
import { router } from 'expo-router';

import { parseMarkdownLinkTarget } from './markdown-links.js';

/** Scroll callbacks for same-page anchor links. */
export interface MarkdownLinkHandlers {
  scrollToAnchor: (anchorId: string) => void;
}

/**
 * Handle markdown link press. Return `true` to fall through to Linking.openURL.
 */
export function handleMarkdownLinkPress(href: string, handlers: MarkdownLinkHandlers): boolean {
  const target = parseMarkdownLinkTarget(href);
  if (!target) {
    return false;
  }

  switch (target.kind) {
    case 'anchor':
      handlers.scrollToAnchor(target.id);
      return false;
    case 'internal': {
      const path = target.pathname as '/privacy' | '/terms' | '/opensource';
      router.push(path);
      return false;
    }
    case 'external':
      void Linking.openURL(target.url);
      return false;
    default:
      return false;
  }
}
