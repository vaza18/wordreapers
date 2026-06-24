import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { loadBundledBaseWords, loadBundledDictionary } from '@/services/dictionary-service';
import {
  BaseWordSuggestDropdown,
  type BaseWordSuggestItem,
} from '@/components/BaseWordSuggestDropdown';
import { RoundSettingsFields } from '@/components/RoundSettingsFields';
import { SetupModeButton } from '@/components/SetupModeButton';
import { ShuffleBaseWordButton } from '@/components/ShuffleBaseWordButton';
import { Screen } from '@/components/Screen';
import { GroupPlayersIcon, SoloPlayerIcon } from '@/components/PlayerModeIcons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { headerIconButtonSize } from '@/constants/header-button';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { navigateHomeWithBackAnimation } from '@/lib/navigation/navigate-home';
import { joinErrorMessage } from '@/lib/firebase/join-error-message';
import { subscribeGameSession, updateGameSessionSetup } from '@/lib/firebase/game-session-service';
import {
  gameSessionSettingsFromSetup,
  resolveGameSessionSettings,
} from '@/lib/firebase/session-settings';
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
import { useFirebaseStore } from '@/store/firebase-store';
import type { UniqueBonusMode } from '@/lib/game/scoring';
import { useOrganizerSoloStore } from '@/store/organizer-solo-store';
import { useSettingsStore } from '@/store/settings-store';

const MIN_BASE_WORD_LENGTH = 6;
const SUGGEST_DROPDOWN_LIMIT = 50;

/**
 * Organizer round setup — local until invite or solo start.
 */
export default function OnlineSetupScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
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
  const [baseWordFocused, setBaseWordFocused] = useState(false);
  const [organizerUid, setOrganizerUid] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(1);

  useEffect(() => {
    if (!fromLobby || !gameId) {
      return undefined;
    }
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
      setPlayerCount(Object.keys(session.players).length);
      if (session.baseWord) {
        setBaseWordInput(
          dictionary?.lookupDisplayUpper(session.baseWord) ?? session.baseWord.toUpperCase(),
        );
      }
      if (session.settings) {
        const resolved = resolveGameSessionSettings(
          session.settings,
          Object.keys(session.players).length,
        );
        setGameSetupDuration(Math.round(resolved.durationSeconds / 60));
        setGameSetupUniqueBonusMode(resolved.uniqueBonusMode ?? 'auto');
        setGameSetupAllowProperNouns(resolved.allowProperNouns);
        setGameSetupAllowSlang(resolved.allowSlang);
      }
    });
  }, [
    dictionary,
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

  const canContinue = letterCount(baseWordInput) >= MIN_BASE_WORD_LENGTH;

  const buildSetup = (): LocalRoomSetup => ({
    baseWord: normalizeUk(baseWordInput),
    baseWordDisplay: baseWordInput.trim(),
    durationMinutes,
    uniqueBonusMode: uniqueBonusMode as UniqueBonusMode,
    allowProperNouns,
    allowSlang,
  });

  const handleBack = useCallback(() => {
    if (fromLobby) {
      router.back();
      return;
    }
    if (gameId) {
      removeLocalRoomDraft(gameId);
    }
    navigateHomeWithBackAnimation();
  }, [fromLobby, gameId]);

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
      onBack();
    } catch {
      setError(t('online.errorSaveSetup'));
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
      if (firebase?.uid) {
        setOrganizerUid(firebase.uid);
        useFirebaseStore.getState().setConnection({
          status: firebase.status,
          uid: firebase.uid,
          errorMessage: firebase.errorMessage ?? null,
        });
      }
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
        <View style={styles.baseWordField}>
          <View style={styles.baseWordRow}>
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, showSuggestDropdown ? styles.inputActive : null]}
              value={baseWordInput}
              onChangeText={setBaseWordInput}
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
                setBaseWordInput(display);
                setBaseWordFocused(false);
              }}
            />
          ) : null}
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
                icon={<GroupPlayersIcon color={colors.textOnAccent} size={32} />}
                label={t('online.inviteOthers')}
                hint={t('online.inviteOthersHint')}
                disabled={!canContinue || saving}
                onPress={() => {
                  void handleInviteOthers();
                }}
              />
              <SetupModeButton
                icon={<SoloPlayerIcon color={colors.textPrimary} size={28} />}
                label={t('online.soloPlay')}
                hint={t('online.soloPlayHint')}
                variant="secondary"
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
    baseWordRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      height: headerIconButtonSize,
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
