import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, spacing } from '@/constants/theme';

/**
 * Welcome screen footer: privacy, terms, open source.
 */
export function LegalFooterLinks() {
  const { t } = useTranslation();

  const links = [
    { key: 'privacy', label: t('home.privacy'), href: '/privacy' as const },
    { key: 'terms', label: t('home.terms'), href: '/terms' as const },
    { key: 'openSource', label: t('home.openSource'), href: '/opensource' as const },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.legalRow}>
        {links.map((link, index) => (
          <View key={link.key} style={styles.linkSlot}>
            {index > 0 ? <Text style={styles.sep}>·</Text> : null}
            <FeedbackPressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => {
                router.push(link.href);
              }}
            >
              <Text style={styles.legalLink}>{link.label}</Text>
            </FeedbackPressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  linkSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legalLink: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  sep: {
    fontSize: 15,
    color: colors.textTertiary,
  },
});
