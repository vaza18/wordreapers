import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  BaseWordSuggestDropdown,
  type BaseWordSuggestItem,
} from '@/components/BaseWordSuggestDropdown';
import { PlayableWordsCountHint } from '@/components/PlayableWordsCountHint';
import { RoundSettingsFields } from '@/components/RoundSettingsFields';
import { SetupModeButton } from '@/components/SetupModeButton';
import { ShuffleBaseWordButton } from '@/components/ShuffleBaseWordButton';
import { Screen } from '@/components/Screen';
import { GroupPlayersIcon, SoloPlayerIcon } from '@/components/PlayerModeIcons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { MIN_BASE_WORD_LENGTH } from '@/constants/base-word';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import {
  useSetupPlayableLexiconHint,
  type SetupLexiconCommitMode,
} from '@/hooks/useSetupPlayableLexiconHint';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTrainingMilestone } from '@/hooks/useTrainingMilestone';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { navigateHomeWithBackAnimation } from '@/lib/navigation/navigate-home';
import { joinErrorMessage, firebaseBootstrapErrorMessage } from '@/lib/firebase/join-error-message';
import {
  organizerLeaveWaitingLobby,
  subscribeGameSession,
  updateGameSessionSetup,
} from '@/lib/firebase/game-session-service';
import type { GameSessionSnapshot } from '@/lib/firebase/game-session-service';
import {
  gameSessionSettingsFromSetup,
  resolveGameSessionSettingsForSession,
} from '@/lib/firebase/session-settings';
import { sessionContentSafetyLocked } from '@/lib/online/public-lobby/content-safety';
import { isPublicBaseWordSafeFromDisplay } from '@/lib/online/public-lobby/validate-public-base-word';
import { ensureFirebaseReady } from '@/lib/firebase/ensure-firebase-ready';
import { DictionaryIndex } from '@/lib/dictionary/dictionary-index';
import { letterCount, normalizeUk, toDisplayUpper } from '@/lib/dictionary/normalize';
import { randomBaseWord, searchBaseWordPrefixResult } from '@/lib/game/base-word-search';
import {
  getLocalRoomDraft,
  removeLocalRoomDraft,
  type LocalRoomSetup,
} from '@/lib/online/local-room-draft';
import { publishWaitingRoomForDraft } from '@/lib/online/publish-room';
import { abandonOrganizerWaitingRoomForDraft } from '@/lib/online/abandon-tracked-waiting-room';
import { useFirebaseStore } from '@/store/firebase-store';
import type { UniqueBonusMode } from '@/lib/game/scoring';
import { useOrganizerSoloStore } from '@/store/organizer-solo-store';
import { useSettingsStore } from '@/store/settings-store';
import { loadBundledBaseWords, loadBundledDictionary } from '@/services/dictionary-service';

const SUGGEST_DROPDOWN_LIMIT = 50;

/**
 * Organizer round setup — local until invite or solo start.
 */
export default function OnlineSetupScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { buttonSize: headerButtonSize } = useHeaderIconButtonLayout();
  const { t } = useTranslation();
  const { gameId: rawGameId, from: rawFrom } = useLocalSearchParams<{
    gameId: string;
    from?: string;
  }>();
  const gameId = rawGameId ?? '';
  const fromLobby = rawFrom === 'lobby';

  const durationMinutes = useSettingsStore((state) => state.gameSetup.durationMinutes);
  const uniqueBonusMode = useSettingsStore((state) => state.gameSetup.uniqueBonusMode);
  const allowProperNouns = useSettingsStore((state) => state.gameSetup.allowProperNouns);
  const allowSlang = useSettingsStore((state) => state.gameSetup.allowSlang);
  const setGameSetupDuration = useSettingsStore((state) => state.setGameSetupDuration);
  const setGameSetupUniqueBonusMode = useSettingsStore(
    (state) => state.setGameSetupUniqueBonusMode,
  );
  const setGameSetupAllowProperNouns = useSettingsStore(
    (state) => state.setGameSetupAllowProperNouns,
  );
  const setGameSetupAllowSlang = useSettingsStore((state) => state.setGameSetupAllowSlang);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [baseWords, setBaseWords] = useState<string[]>([]);
  const [baseWordInput, setBaseWordInput] = useState('');
  const [lexiconCommitMode, setLexiconCommitMode] = useState<SetupLexiconCommitMode>('typing');
  const [baseWordFocused, setBaseWordFocused] = useState(false);
  const [organizerUid, setOrganizerUid] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(1);
  const [lobbySession, setLobbySession] = useState<GameSessionSnapshot | null>(null);
  const setupHydratedRef = useRef(false);
  const dictionaryRef = useRef(dictionary);
  dictionaryRef.current = dictionary;
  const { hydrated: trainingHydrated, hasCompletedTrainingRound } = useTrainingMilestone();
  const multiplayerLocked = trainingHydrated && !hasCompletedTrainingRound;
  const { status: lexiconHintStatus, maxCount: lexiconMaxCount } = useSetupPlayableLexiconHint({
    baseWordInput,
    allowProperNouns,
    allowSlang,
    commitMode: lexiconCommitMode,
  });

  const showInviteDisabledHint = () => {
    Alert.alert(t('app.name'), t('online.inviteOthersLockedHint'));
  };

  useEffect(() => {
    if (!fromLobby || !gameId || !lobbySession) {
      return;
    }
    if (lobbySession.status === 'playing') {
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
    }
  }, [fromLobby, gameId, lobbySession]);

  useEffect(() => {
    if (!fromLobby || !gameId) {
      return undefined;
    }
    setupHydratedRef.current = false;
    void ensureFirebaseReady().then((result) => {
      if (result?.uid) {
        setOrganizerUid(result.uid);
        useFirebaseStore.getState().setConnection({
          status: result.status,
          uid: result.uid,
          errorMessage: result.errorMessage ?? null,
        });
      }
    });
    return subscribeGameSession(gameId, (session) => {
      if (!session) {
        return;
      }
      setLobbySession(session);
      setPlayerCount(Object.keys(session.players).length);

      const resolved = resolveGameSessionSettingsForSession(session);
      const locked = sessionContentSafetyLocked(session);

      if (!setupHydratedRef.current) {
        setupHydratedRef.current = true;
        if (session.baseWord) {
          setLexiconCommitMode('immediate');
          setBaseWordInput(
            dictionaryRef.current?.lookupDisplayUpper(session.baseWord) ??
              session.baseWord.toUpperCase(),
          );
        }
        setGameSetupDuration(Math.round(resolved.durationSeconds / 60));
        setGameSetupUniqueBonusMode(resolved.uniqueBonusMode ?? 'auto');
        setGameSetupAllowProperNouns(resolved.allowProperNouns);
        setGameSetupAllowSlang(resolved.allowSlang);
        return;
      }

      if (locked) {
        setGameSetupAllowProperNouns(resolved.allowProperNouns);
        setGameSetupAllowSlang(resolved.allowSlang);
      }
    });
  }, [
    fromLobby,
    gameId,
    setGameSetupAllowProperNouns,
    setGameSetupAllowSlang,
    setGameSetupDuration,
    setGameSetupUniqueBonusMode,
  ]);

  useEffect(() => {
    void Promise.all([loadBundledDictionary(), loadBundledBaseWords()])
      .then(([dict, words]) => {
        setDictionary(dict);
        setBaseWords(words);
        const initial = randomBaseWord(words);
        if (initial) {
          setLexiconCommitMode('immediate');
          setBaseWordInput(dict.lookupDisplayUpper(initial) ?? toDisplayUpper(initial));
        }
        setLoading(false);
      })
      .catch(() => {
        setError(t('game.dictMissing'));
        setLoading(false);
      });
  }, [t]);

  const suggestionResult = useMemo((): {
    items: BaseWordSuggestItem[];
    total: number;
  } => {
    if (!dictionary || letterCount(baseWordInput) < 2) {
      return { items: [], total: 0 };
    }
    const { words, total } = searchBaseWordPrefixResult(
      baseWords,
      baseWordInput,
      SUGGEST_DROPDOWN_LIMIT,
    );
    const items = words.map((word) => {
      const display = dictionary.lookupDisplayUpper(word) ?? toDisplayUpper(word);
      return { display, letterCount: letterCount(display) };
    });
    return { items, total };
  }, [baseWordInput, baseWords, dictionary]);

  const showSuggestDropdown = baseWordFocused && suggestionResult.items.length > 0;
  const suggestMoreLabel = t('game.baseWordSuggestMore', {
    count: Math.max(0, suggestionResult.total - suggestionResult.items.length),
  });

  const dictionaryOptionsLocked =
    fromLobby && lobbySession ? sessionContentSafetyLocked(lobbySession) : false;
  const baseWordDictionaryRequired = dictionaryOptionsLocked;
  const baseWordAllowed = baseWordDictionaryRequired
    ? isPublicBaseWordSafeFromDisplay(baseWordInput, baseWords)
    : true;
  const canContinue = letterCount(baseWordInput) >= MIN_BASE_WORD_LENGTH && baseWordAllowed;

  const buildSetup = (): LocalRoomSetup => ({
    baseWord: normalizeUk(baseWordInput),
    baseWordDisplay: baseWordInput.trim(),
    durationMinutes,
    uniqueBonusMode: uniqueBonusMode as UniqueBonusMode,
    allowProperNouns,
    allowSlang,
  });

  const returnToLobby = useCallback(() => {
    router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
  }, [gameId]);

  const handleBack = useCallback(() => {
    if (!fromLobby && gameId) {
      removeLocalRoomDraft(gameId);
    }
    if (fromLobby) {
      void (async () => {
        if (gameId && organizerUid && lobbySession) {
          try {
            await organizerLeaveWaitingLobby(gameId, organizerUid, lobbySession);
          } catch (error) {
            if (__DEV__) {
              console.warn('setup leave lobby to home', error);
            }
          }
        }
        if (router.canDismiss()) {
          router.dismissTo('/');
        } else {
          router.replace('/');
        }
      })();
      return;
    }
    navigateHomeWithBackAnimation();
  }, [fromLobby, gameId, lobbySession, organizerUid]);

  const onBack = useSyncedStackBack(handleBack);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
    }),
    [onBack],
  );

  const handleSaveLobbySetup = async () => {
    if (!canContinue || !gameId || !organizerUid) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateGameSessionSetup(gameId, organizerUid, {
        baseWord: normalizeUk(baseWordInput),
        settings: gameSessionSettingsFromSetup(
          durationMinutes,
          uniqueBonusMode as UniqueBonusMode,
          allowProperNouns,
          allowSlang,
          playerCount,
        ),
      });
      returnToLobby();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'BASE_WORD_NOT_ALLOWED') {
        setError(t('online.publicRoomNeedsSafeBaseWord'));
      } else {
        setError(t('online.errorSaveSetup'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleInviteOthers = async () => {
    if (!canContinue || !gameId) {
      return;
    }
    const draft = getLocalRoomDraft(gameId);
    if (!draft) {
      setError(t('online.errorRoomNotFound'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const firebase = await ensureFirebaseReady();
      if (!firebase || firebase.status !== 'ok' || !firebase.uid) {
        setError(firebaseBootstrapErrorMessage(firebase?.errorMessage, t));
        return;
      }
      setOrganizerUid(firebase.uid);
      useFirebaseStore.getState().setConnection({
        status: firebase.status,
        uid: firebase.uid,
        errorMessage: firebase.errorMessage ?? null,
      });
      const setup = buildSetup();
      const publishedId = await publishWaitingRoomForDraft(draft, setup);
      router.push({ pathname: '/online/lobby/[gameId]', params: { gameId: publishedId } });
    } catch (err) {
      setError(joinErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const handleSoloPlay = () => {
    if (!canContinue || !gameId) {
      return;
    }
    const draft = getLocalRoomDraft(gameId);
    if (!draft) {
      setError(t('online.errorRoomNotFound'));
      return;
    }
    const setup = buildSetup();
    const initFromSetup = useOrganizerSoloStore.getState().initFromSetup;
    const startRound = useOrganizerSoloStore.getState().startRound;
    initFromSetup(gameId, setup);
    startRound();
    router.push({ pathname: '/online/solo/[gameId]', params: { gameId } });
    void abandonOrganizerWaitingRoomForDraft(gameId).catch((error) => {
      if (__DEV__) {
        console.warn('setup solo abandon waiting room for draft', error);
      }
    });
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen keyboardShouldPersistTaps="handled">
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.rotationHint}>{t('online.setupRotationHint')}</Text>

        <Text style={styles.sectionLabel}>{t('game.baseWord')}</Text>
        <View style={styles.baseWordBlock}>
          <View style={styles.baseWordField}>
            <View style={styles.baseWordRow}>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  styles.input,
                  { height: headerButtonSize },
                  showSuggestDropdown ? styles.inputActive : null,
                ]}
                value={baseWordInput}
                onChangeText={(text) => {
                  setLexiconCommitMode('typing');
                  setBaseWordInput(text);
                }}
                onFocus={() => setBaseWordFocused(true)}
                onBlur={() => {
                  setTimeout(() => setBaseWordFocused(false), 200);
                }}
                placeholder={t('game.baseWordPlaceholder')}
              />
              <ShuffleBaseWordButton
                onPress={() => {
                  const next = randomBaseWord(baseWords);
                  if (next && dictionary) {
                    setLexiconCommitMode('immediate');
                    setBaseWordInput(dictionary.lookupDisplayUpper(next) ?? toDisplayUpper(next));
                  }
                }}
              />
            </View>
            {showSuggestDropdown ? (
              <BaseWordSuggestDropdown
                items={suggestionResult.items}
                totalCount={suggestionResult.total}
                moreLabel={suggestMoreLabel}
                onSelect={(display) => {
                  setLexiconCommitMode('immediate');
                  setBaseWordInput(display);
                  setBaseWordFocused(false);
                }}
              />
            ) : null}
          </View>

          <View style={styles.baseWordHints}>
            <Text style={styles.baseWordHint}>{t('game.baseWordHint')}</Text>
            <PlayableWordsCountHint status={lexiconHintStatus} maxCount={lexiconMaxCount} />
            {baseWordDictionaryRequired ? (
              <Text style={styles.baseWordHint}>{t('online.publicRoomNeedsSafeBaseWord')}</Text>
            ) : null}
          </View>
        </View>

        <RoundSettingsFields
          durationMinutes={durationMinutes}
          onDurationChange={setGameSetupDuration}
          uniqueBonusMode={uniqueBonusMode as UniqueBonusMode}
          onUniqueBonusModeChange={setGameSetupUniqueBonusMode}
          allowProperNouns={allowProperNouns}
          onAllowProperNounsChange={setGameSetupAllowProperNouns}
          allowSlang={allowSlang}
          onAllowSlangChange={setGameSetupAllowSlang}
          dictionaryOptionsLocked={dictionaryOptionsLocked}
          dictionaryOptionsLockedHint={t('online.dictionaryOptionsLockedHint')}
        />

        <View style={styles.actions}>
          {fromLobby ? (
            <PrimaryButton
              label={t('common.save')}
              disabled={!canContinue || saving || !organizerUid}
              onPress={() => {
                void handleSaveLobbySetup();
              }}
            />
          ) : (
            <View style={styles.modeRow}>
              <SetupModeButton
                icon={
                  <GroupPlayersIcon
                    color={multiplayerLocked ? colors.textPrimary : colors.textOnAccent}
                    size={32}
                  />
                }
                label={t('online.inviteOthers')}
                hint={
                  multiplayerLocked
                    ? t('online.inviteOthersLockedHint')
                    : t('online.inviteOthersHint')
                }
                variant={multiplayerLocked ? 'secondary' : 'primary'}
                disabled={!canContinue || saving || multiplayerLocked}
                disabledHint={t('online.inviteOthersLockedHint')}
                onDisabledPress={showInviteDisabledHint}
                onPress={() => {
                  void handleInviteOthers();
                }}
              />
              <SetupModeButton
                icon={
                  <SoloPlayerIcon
                    color={multiplayerLocked ? colors.textOnAccent : colors.textPrimary}
                    size={28}
                  />
                }
                label={t('online.soloPlay')}
                hint={t('online.soloPlayHint')}
                variant={multiplayerLocked ? 'primary' : 'secondary'}
                disabled={!canContinue || saving}
                onPress={handleSoloPlay}
              />
            </View>
          )}
        </View>
      </Screen>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    muted: {
      color: colors.textSecondary,
    },
    rotationHint: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    sectionLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    baseWordField: {
      zIndex: 10,
    },
    baseWordBlock: {
      gap: 2,
    },
    baseWordHints: {
      gap: 2,
    },
    baseWordHint: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    baseWordRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 0,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.backgroundPrimary,
    },
    inputActive: {
      borderColor: colors.accent,
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
    },
  });
}
