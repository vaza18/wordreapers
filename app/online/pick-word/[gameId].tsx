import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { loadBundledBaseWords, loadBundledDictionary } from '@/services/dictionary-service';
import {
  BaseWordSuggestDropdown,
  type BaseWordSuggestItem,
} from '@/components/BaseWordSuggestDropdown';
import { PlayableWordsCountHint } from '@/components/PlayableWordsCountHint';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundSettingsFields } from '@/components/RoundSettingsFields';
import { Screen } from '@/components/Screen';
import { ShuffleBaseWordButton } from '@/components/ShuffleBaseWordButton';
import { MIN_BASE_WORD_LENGTH } from '@/constants/base-word';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useBaseWordSuggestField } from '@/hooks/useBaseWordSuggestField';
import {
  useSetupPlayableLexiconHint,
  type SetupLexiconCommitMode,
} from '@/hooks/useSetupPlayableLexiconHint';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useSyncedStackBack } from '@/hooks/useSyncedStackBack';
import { stackHeaderBack } from '@/lib/navigation/stack-header-options';
import { DictionaryIndex } from '@/lib/dictionary/dictionary-index';
import { letterCount, normalizeUk, toDisplayUpper } from '@/lib/dictionary/normalize';
import { randomBaseWord, searchBaseWordPrefixResult } from '@/lib/game/base-word-search';
import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import {
  subscribeGameSession,
  updateGameSessionSetup,
  type GameSessionSnapshot,
} from '@/lib/firebase/game-session-service';
import {
  gameSessionSettingsFromSetup,
  resolveGameSessionSettingsForSession,
} from '@/lib/firebase/session-settings';
import { sessionContentSafetyLocked } from '@/lib/online/public-lobby/content-safety';
import { isPublicBaseWordSafeFromDisplay } from '@/lib/online/public-lobby/validate-public-base-word';
import { baseWordPickerTurnNumber, isCurrentBaseWordPicker } from '@/lib/online/base-word-picker';
import { shouldEnablePickWordPresence } from '@/lib/online/lobby-pick-word-navigation';
import { handoffPlayerPresence } from '@/lib/online/presence/presence-handoff';
import { usePlayerOnlinePresence } from '@/lib/online/presence/use-player-online-presence';
import type { UniqueBonusMode } from '@/lib/game/scoring';

const SUGGEST_DROPDOWN_LIMIT = 50;

/**
 * Rotating base-word picker (one player per round, join order).
 */
export default function OnlinePickWordScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { buttonSize: headerButtonSize } = useHeaderIconButtonLayout();
  const { t } = useTranslation();
  const { gameId: rawGameId, fromLobby: rawFromLobby } = useLocalSearchParams<{
    gameId: string;
    fromLobby?: string;
  }>();
  const gameId = rawGameId ?? '';
  const fromLobby = rawFromLobby === '1';
  const isFocused = useIsFocused();

  const [loading, setLoading] = useState(true);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [baseWords, setBaseWords] = useState<string[]>([]);
  const [baseWordInput, setBaseWordInput] = useState('');
  const [lexiconCommitMode, setLexiconCommitMode] = useState<SetupLexiconCommitMode>('typing');
  const [baseWordFocused, setBaseWordFocused] = useState(false);
  const {
    onChangeText: onBaseWordChangeText,
    onFocus: onBaseWordFocus,
    onBlur: onBaseWordBlur,
    onTouchSelectStart,
    onTouchSelectEnd,
    commitBaseWordDisplay,
  } = useBaseWordSuggestField({
    baseWordInput,
    setBaseWordInput,
    setLexiconCommitMode,
    setBaseWordFocused,
  });
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [uniqueBonusMode, setUniqueBonusMode] = useState<UniqueBonusMode>('auto');
  const [allowProperNouns, setAllowProperNouns] = useState(false);
  const [allowSlang, setAllowSlang] = useState(false);
  const sessionPrefilledRef = useRef(false);

  useEffect(() => {
    void Promise.all([loadBundledDictionary(), loadBundledBaseWords()])
      .then(([dict, words]) => {
        setDictionary(dict);
        setBaseWords(words);
        setLoading(false);
      })
      .catch(() => {
        setError(t('game.dictMissing'));
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }
    void ensureAnonymousAuth().then((user) => {
      setMyUid(user.uid);
    });
    return subscribeGameSession(gameId, (next) => {
      setSession(next);
      setSessionLoaded(true);
    });
  }, [gameId]);

  usePlayerOnlinePresence(
    gameId,
    myUid ?? undefined,
    Boolean(gameId && myUid && shouldEnablePickWordPresence(fromLobby)),
    // Same as rematch lobby: multi-sim `inactive` must not mark the picker offline
    // while they are still on this waiting-phase screen (from rematch, not fromLobby).
    'background-only',
  );

  const { status: lexiconHintStatus, maxCount: lexiconMaxCount } = useSetupPlayableLexiconHint({
    baseWordInput,
    allowProperNouns,
    allowSlang,
    commitMode: lexiconCommitMode,
  });

  const goToLobby = useCallback(() => {
    if (fromLobby) {
      // Lobby stayed mounted under push — pop back; do not replace (avoids exit-home).
      if (router.canGoBack()) {
        router.back();
        return;
      }
    }
    handoffPlayerPresence(gameId);
    router.replace({
      pathname: '/online/lobby/[gameId]',
      params: { gameId, optedIn: '1' },
    });
  }, [fromLobby, gameId]);

  useEffect(() => {
    if (!isFocused || !session || !myUid) {
      return;
    }
    if (session.status !== 'waiting') {
      goToLobby();
      return;
    }
    if (!isCurrentBaseWordPicker(session, myUid)) {
      goToLobby();
    }
  }, [goToLobby, isFocused, myUid, session]);

  useEffect(() => {
    if (!session || !dictionary || sessionPrefilledRef.current) {
      return;
    }
    sessionPrefilledRef.current = true;
    const resolved = resolveGameSessionSettingsForSession(session);
    setDurationMinutes(Math.round(resolved.durationSeconds / 60));
    setUniqueBonusMode(resolved.uniqueBonusMode ?? 'auto');
    setAllowProperNouns(resolved.allowProperNouns);
    setAllowSlang(resolved.allowSlang);
    if (session.baseWord) {
      setLexiconCommitMode('immediate');
      setBaseWordInput(
        dictionary.lookupDisplayUpper(session.baseWord) ?? session.baseWord.toUpperCase(),
      );
    } else {
      const initial = randomBaseWord(baseWords);
      if (initial) {
        setLexiconCommitMode('immediate');
        setBaseWordInput(dictionary.lookupDisplayUpper(initial) ?? toDisplayUpper(initial));
      }
    }
  }, [baseWords, dictionary, session]);

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
  const dictionaryOptionsLocked = session ? sessionContentSafetyLocked(session) : false;
  const baseWordDictionaryRequired = dictionaryOptionsLocked;
  const baseWordAllowed = baseWordDictionaryRequired
    ? isPublicBaseWordSafeFromDisplay(baseWordInput, baseWords)
    : true;
  const canSave =
    letterCount(baseWordInput) >= MIN_BASE_WORD_LENGTH && Boolean(myUid) && baseWordAllowed;
  const playerCount = session ? Object.keys(session.players).length : 1;

  const handleBack = useCallback(() => {
    goToLobby();
  }, [goToLobby]);

  const onBack = useSyncedStackBack(handleBack);

  const screenOptions = useMemo(
    () => ({
      ...stackHeaderBack(onBack),
    }),
    [onBack],
  );

  const handleSave = async () => {
    if (!myUid || !canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateGameSessionSetup(gameId, myUid, {
        baseWord: normalizeUk(baseWordInput),
        settings: gameSessionSettingsFromSetup(
          durationMinutes,
          uniqueBonusMode,
          allowProperNouns,
          allowSlang,
          playerCount,
        ),
      });
      goToLobby();
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

  const turn = session ? baseWordPickerTurnNumber(session) : 1;

  if (!loading && sessionLoaded && !session) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <Screen>
          <Text style={styles.error}>{t('online.errorRoomNotFound')}</Text>
          <PrimaryButton
            label={t('online.roomRematchRetry')}
            onPress={() => {
              goToLobby();
            }}
          />
          <PrimaryButton
            label={t('nav.home')}
            variant="secondary"
            onPress={() => {
              router.replace('/');
            }}
          />
        </Screen>
      </>
    );
  }

  if (loading || !session || !myUid) {
    return (
      <>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('online.pickWordIntro', { turn })}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

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
                onChangeText={onBaseWordChangeText}
                onFocus={onBaseWordFocus}
                onBlur={onBaseWordBlur}
                placeholder={t('game.baseWordPlaceholder')}
              />
              <ShuffleBaseWordButton
                onPress={() => {
                  const next = randomBaseWord(baseWords);
                  if (next && dictionary) {
                    commitBaseWordDisplay(
                      dictionary.lookupDisplayUpper(next) ?? toDisplayUpper(next),
                    );
                  }
                }}
              />
            </View>
            {showSuggestDropdown ? (
              <BaseWordSuggestDropdown
                items={suggestionResult.items}
                totalCount={suggestionResult.total}
                onTouchSelectStart={onTouchSelectStart}
                onTouchSelectEnd={onTouchSelectEnd}
                onSelect={commitBaseWordDisplay}
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
          onDurationChange={setDurationMinutes}
          uniqueBonusMode={uniqueBonusMode}
          onUniqueBonusModeChange={setUniqueBonusMode}
          allowProperNouns={allowProperNouns}
          onAllowProperNounsChange={setAllowProperNouns}
          allowSlang={allowSlang}
          onAllowSlangChange={setAllowSlang}
          dictionaryOptionsLocked={dictionaryOptionsLocked}
          dictionaryOptionsLockedHint={t('online.dictionaryOptionsLockedHint')}
        />

        <PrimaryButton
          label={t('common.continue')}
          disabled={!canSave || saving}
          onPress={() => {
            void handleSave();
          }}
        />
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
    },
    intro: {
      fontSize: 14,
      lineHeight: 20,
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
      backgroundColor: colors.backgroundPrimary,
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 0,
      fontSize: 16,
      color: colors.textPrimary,
    },
    inputActive: {
      borderColor: colors.accent,
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
    },
  });
}
