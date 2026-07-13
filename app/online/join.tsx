import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { RoomCodeInput } from '@/components/RoomCodeInput';
import { RoomQrScanner } from '@/components/RoomQrScanner';
import { Screen } from '@/components/Screen';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { resetFirebaseBootstrap } from '@/lib/firebase/bootstrap';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import {
  firebaseBootstrapErrorMessage,
  firebaseConfigErrorMessage,
  joinErrorMessage,
} from '@/lib/firebase/join-error-message';
import { joinGameSession } from '@/lib/firebase/game-session-service';
import { resolvePostJoinRoute } from '@/lib/online/post-join-route';
import { isValidRoomCode, normalizeRoomCode } from '@/lib/firebase/room-code';
import { isExpoCameraAvailable } from '@/lib/native/is-expo-camera-available';
import { useFirebaseStore } from '@/store/firebase-store';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { useProfileStore } from '@/store/profile-store';

/**
 * Join multiplayer room by code or QR (mockup screen 8).
 */
export default function JoinRoomScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { code: codeFromLink, invitedBy: invitedByFromLink } = useLocalSearchParams<{
    code?: string | string[];
    invitedBy?: string | string[];
  }>();
  const [code, setCode] = useState('');
  const [invitedByUid, setInvitedByUid] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [prewarming, setPrewarming] = useState(false);
  const canScanQr = isExpoCameraAvailable();
  const firebaseStatus = useFirebaseStore((state) => state.status);
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();
  const joinLocked = trainingHydrated && !hasCompletedTrainingRound;

  useEffect(() => {
    if (firebaseStatus === 'not_configured' || firebaseStatus === 'ok') {
      setPrewarming(false);
      return undefined;
    }
    let cancelled = false;
    setPrewarming(true);
    void ensureFirebaseReady().then((result) => {
      if (cancelled) {
        return;
      }
      setPrewarming(false);
      if (result?.status === 'ok') {
        useFirebaseStore.getState().setConnection({
          status: result.status,
          uid: result.uid ?? null,
          errorMessage: result.errorMessage ?? null,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseStatus]);

  useEffect(() => {
    const raw = Array.isArray(codeFromLink) ? codeFromLink[0] : codeFromLink;
    if (raw) {
      setCode(raw);
    }
    const inviter = Array.isArray(invitedByFromLink) ? invitedByFromLink[0] : invitedByFromLink;
    if (inviter) {
      setInvitedByUid(inviter);
    }
  }, [codeFromLink, invitedByFromLink]);

  const joinWithCode = async (rawCode: string, joinOptions?: { invitedByUid?: string }) => {
    if (joinLocked) {
      setError(t('online.joinLockedBanner'));
      return;
    }
    const normalized = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(normalized)) {
      setError(t('online.errorInvalidCode'));
      return;
    }
    if (firebaseStatus === 'not_configured') {
      setError(firebaseConfigErrorMessage(t, 'Missing EXPO_PUBLIC_FIREBASE_* in .env'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (firebaseStatus === 'error') {
        resetFirebaseBootstrap();
      }
      const firebase = await ensureFirebaseReady({ forceRetry: firebaseStatus === 'error' });
      useFirebaseStore.getState().setConnection({
        status: firebase.status,
        uid: firebase.uid ?? null,
        errorMessage: firebase.errorMessage ?? null,
      });
      if (firebase.status !== 'ok') {
        setError(firebaseBootstrapErrorMessage(firebase.errorMessage, t));
        return;
      }

      const { name, gender, avatarColorIndex } = useProfileStore.getState();
      const inviter = joinOptions?.invitedByUid ?? invitedByUid;
      const session = await joinGameSession(
        normalized,
        { name, gender, avatarColorIndex },
        inviter ? { invitedByUid: inviter } : undefined,
      );
      const uid = firebase.uid ?? '';
      const route = resolvePostJoinRoute(session, uid, normalized);
      router.replace(route);
    } catch (err) {
      setError(joinErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    void joinWithCode(code);
  };

  const handleBack = useCallback(() => {
    router.back();
  }, []);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(handleBack),
    }),
    [handleBack],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen>
        {joinLocked ? (
          <Text style={styles.lockedBanner}>{t('online.joinLockedBanner')}</Text>
        ) : null}
        <Text style={styles.hint}>{t('online.joinHint')}</Text>
        <RoomCodeInput value={code} onChange={setCode} disabled={joinLocked} />
        {prewarming && !loading ? (
          <Text style={styles.hint}>{t('online.cloudConnecting')}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.accent} /> : null}

        {canScanQr ? (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('online.joinOrScan')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <PrimaryButton
              label={t('online.scanQr')}
              variant="secondary"
              disabled={joinLocked || loading}
              onPress={() => {
                setScannerOpen(true);
              }}
            />

            <RoomQrScanner
              visible={scannerOpen}
              onClose={() => {
                setScannerOpen(false);
              }}
              onCodeScanned={(payload) => {
                setCode(payload.code);
                setInvitedByUid(payload.invitedBy);
                void joinWithCode(payload.code, { invitedByUid: payload.invitedBy });
              }}
            />
          </>
        ) : null}

        <PrimaryButton
          label={t('online.joinAction')}
          disabled={joinLocked || loading || !isValidRoomCode(normalizeRoomCode(code))}
          onPress={handleJoin}
        />

        <View style={styles.publicSection}>
          <View style={styles.sectionDivider} />
          <Text style={styles.findPublicHint}>{t('online.findPublicGameHint')}</Text>
          <PrimaryButton
            label={t('online.findPublicGame')}
            variant="secondary"
            disabled={joinLocked || loading}
            onPress={() => {
              router.push('/online/browse');
            }}
          />
        </View>
      </Screen>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    lockedBanner: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.composeDraftText,
      backgroundColor: colors.composeDraftBg,
      borderWidth: 1,
      borderColor: colors.alert,
      borderRadius: radii.sm,
      padding: spacing.sm,
      textAlign: 'center',
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
      textAlign: 'center',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginVertical: spacing.xs,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSecondary,
    },
    dividerText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    publicSection: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSecondary,
      marginVertical: spacing.sm,
    },
    findPublicHint: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
}
