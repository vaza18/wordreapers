import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/PlayerAvatar';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import type { GameSessionPlayer } from '@/lib/firebase/types';
import {
  displayPlayerName,
  viewerPublicAlias,
} from '@/lib/online/public-lobby/display-player-name';

export type LobbyPlayer = GameSessionPlayer & { uid: string };

export interface LobbyPlayerListProps {
  players: readonly LobbyPlayer[];
  session: GameSessionSnapshot;
  myUid: string;
  pickerUid: string | null;
}

/** Player count label and the roster rows (avatar, name, organizer/picker/offline tags). */
export function LobbyPlayerList({ players, session, myUid, pickerUid }: LobbyPlayerListProps) {
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  return (
    <>
      <Text style={styles.sectionLabel}>{t('online.playersCount', { count: players.length })}</Text>

      {players.map(({ uid, name, avatarColorIndex, online, ...playerRest }) => {
        const displayName = displayPlayerName({ name, ...playerRest }, myUid, uid, session);
        const seenAs = uid === myUid ? viewerPublicAlias(playerRest, session) : null;
        return (
          <View key={uid} style={styles.playerRow}>
            <PlayerAvatar name={displayName} avatarColorIndex={avatarColorIndex ?? 0} />
            <View style={styles.playerNameBlock}>
              <Text style={styles.playerName}>{displayName}</Text>
              {seenAs ? (
                <Text style={styles.playerSeenAs}>
                  {t('online.youAreSeenAs', { alias: seenAs })}
                </Text>
              ) : null}
            </View>
            {uid === session.organizerId ? (
              <Text style={styles.organizerTag}>{t('online.organizer')}</Text>
            ) : null}
            {uid === pickerUid && session.status === 'waiting' ? (
              <Text style={styles.pickerTag}>{t('online.pickerTag')}</Text>
            ) : null}
            {!online ? <Text style={styles.offlineTag}>📵</Text> : null}
          </View>
        );
      })}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sectionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    playerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    playerNameBlock: {
      flex: 1,
      gap: 2,
    },
    playerName: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    playerSeenAs: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    organizerTag: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.accent,
      backgroundColor: colors.accentMuted,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
    },
    pickerTag: {
      fontSize: 11,
      fontWeight: '600',
      color: '#633806',
      backgroundColor: '#FAEEDA',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
    },
    offlineTag: {
      fontSize: 14,
    },
  });
}
