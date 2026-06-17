import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown, { type RenderRules } from 'react-native-markdown-display';

import { colors, spacing } from '@/constants/theme';
import { legalDocumentsUk, type LegalDocumentKey } from '@/lib/legal/bundled-legal';
import { markdownAstPlainText } from '@/lib/legal/markdown-ast-text';
import { handleMarkdownLinkPress } from '@/lib/legal/handle-markdown-link';
import { markdownHeadingSlug } from '@/lib/legal/markdown-links';

interface LegalDocumentViewProps {
  documentKey: LegalDocumentKey;
}

type MarkdownAstNode = {
  key: string;
  content?: string;
  children?: MarkdownAstNode[];
  attributes?: { href?: string };
};

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  heading2: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  heading3: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: spacing.sm,
  },
  bullet_list: {
    marginBottom: spacing.sm,
  },
  ordered_list: {
    marginBottom: spacing.sm,
  },
  list_item: {
    marginBottom: spacing.xs,
  },
  link: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  strong: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  em: {
    fontStyle: 'italic',
  },
  hr: {
    backgroundColor: colors.borderTertiary,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  blockquote: {
    backgroundColor: colors.accentMuted,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  code_inline: {
    backgroundColor: colors.accentMuted,
    color: colors.textPrimary,
    fontFamily: 'Menlo',
    fontSize: 14,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    backgroundColor: colors.backgroundPrimary,
    borderColor: colors.borderTertiary,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  code_block: {
    fontFamily: 'Menlo',
    fontSize: 13,
    color: colors.textPrimary,
  },
  inlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});

const CONTENT_PADDING_TOP = spacing.sm;
const ANCHOR_SCROLL_RETRY_MS = 50;
const ANCHOR_SCROLL_MAX_ATTEMPTS = 4;

/**
 * Styled markdown renderer for bundled legal/about documents.
 */
export function LegalDocumentView({ documentKey }: LegalDocumentViewProps) {
  const text = legalDocumentsUk[documentKey];
  const scrollRef = useRef<ScrollView>(null);
  const anchorOffsets = useRef(new Map<string, number>());

  const scrollToAnchor = useCallback((anchorId: string) => {
    const normalizedId = decodeURIComponent(anchorId);

    const tryScroll = (attempt: number) => {
      const y = anchorOffsets.current.get(normalizedId);
      if (y == null) {
        if (attempt < ANCHOR_SCROLL_MAX_ATTEMPTS) {
          setTimeout(() => tryScroll(attempt + 1), ANCHOR_SCROLL_RETRY_MS);
        }
        return;
      }

      scrollRef.current?.scrollTo({
        y: Math.max(0, y + CONTENT_PADDING_TOP - spacing.sm),
        animated: true,
      });
    };

    tryScroll(0);
  }, []);

  const onLinkPress = useCallback(
    (href: string) => handleMarkdownLinkPress(href, { scrollToAnchor }),
    [scrollToAnchor],
  );

  const rules = useMemo((): RenderRules => {
    const registerHeading =
      (level: 1 | 2 | 3 | 4 | 5 | 6) =>
      (
        node: MarkdownAstNode,
        children: ReactNode,
        _parent: unknown,
        styles: Record<string, object>,
      ) => {
        const styleKey = `_VIEW_SAFE_heading${level}`;
        const slug = markdownHeadingSlug(markdownAstPlainText(node));

        return (
          <View
            key={node.key}
            style={styles[styleKey]}
            collapsable={false}
            onLayout={(event) => {
              if (!slug) {
                return;
              }
              anchorOffsets.current.set(slug, event.nativeEvent.layout.y);
            }}
          >
            {children}
          </View>
        );
      };

    return {
      heading1: registerHeading(1),
      heading2: registerHeading(2),
      heading3: registerHeading(3),
      heading4: registerHeading(4),
      heading5: registerHeading(5),
      heading6: registerHeading(6),
      body: (node, children, _parent, styles) => (
        <View key={node.key} collapsable={false} style={styles._VIEW_SAFE_body}>
          {children}
        </View>
      ),
      inline: (node, children, _parent, styles) => (
        <View key={node.key} style={[styles._VIEW_SAFE_inline, markdownStyles.inlineRow]}>
          {children}
        </View>
      ),
      textgroup: (node, children, _parent, styles) => (
        <View key={node.key} style={[styles._VIEW_SAFE_textgroup, markdownStyles.inlineRow]}>
          {children}
        </View>
      ),
      link: (node: MarkdownAstNode, children, _parent, styles) => (
        <Pressable
          key={node.key}
          accessibilityRole="link"
          onPress={() => {
            const href = node.attributes?.href;
            if (href) {
              onLinkPress(href);
            }
          }}
        >
          <Text style={styles.link}>{children}</Text>
        </Pressable>
      ),
    };
  }, [onLinkPress]);

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      <Markdown style={markdownStyles} rules={rules} onLinkPress={onLinkPress}>
        {text}
      </Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
});
