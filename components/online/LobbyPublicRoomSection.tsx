import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { SettingSwitch } from '@/components/SettingSwitch';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import type { UsePublicLobbyPublishResult } from '@/hooks/usePublicLobbyPublish';
import { PUBLIC_LOBBY_TTL_MS } from '@/lib/online/public-lobby/constants';

export interface LobbyPublicRoomSectionProps {
  session: GameSessionSnapshot;
  publicPublish: UsePublicLobbyPublishResult;
  serverNow: number;
  onError: () => void;
}

/** Organizer-only public-room toggle with publish hint and expiry countdown. */
export function LobbyPublicRoomSection({
  session,
  publicPublish,
  serverNow,
  onError,
}: LobbyPublicRoomSectionProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <View style={styles.publicSection}>
      <SettingSwitch
        label={t('online.publicRoom')}
        value={session.isPublic === true}
        onChange={(value) => {
          if (publicPublish.toggling) {
            return;
          }
          if (value && !publicPublish.canPublish) {
            return;
          }
          void publicPublish.togglePublic(value).catch(() => {
            onError();
          });
        }}
      />
      {!publicPublish.canPublish &&
      publicPublish.publishBlockReason &&
      publicPublish.publishBlockReason !== 'BASE_WORDS_LOADING' ? (
        <Text style={styles.publicHint}>{t('online.publicRoomNeedsSafeBaseWord')}</Text>
      ) : publicPublish.canPublish ? (
        <Text style={styles.publicHint}>{t('online.publicRoomHint')}</Text>
      ) : null}
      {session.isPublic && session.publicPublishedAt ? (
        <Text style={styles.publicExpiry}>
          {t('online.publicRoomExpiresIn', {
            minutes: Math.max(
              0,
              Math.ceil((session.publicPublishedAt + PUBLIC_LOBBY_TTL_MS - serverNow) / 60_000),
            ),
          })}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    publicSection: {
      gap: spacing.xs,
      marginVertical: spacing.xs,
    },
    publicHint: {
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    publicExpiry: {
      fontSize: 11,
      color: colors.accent,
      textAlign: 'center',
      fontWeight: '500',
    },
  });
}
