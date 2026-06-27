import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { loadBundledBaseWords, loadBundledDictionary } from '@/services/dictionary-service';
import {
  BaseWordSuggestDropdown,
  type BaseWordSuggestItem,
} from '@/components/BaseWordSuggestDropdown';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RoundSettingsFields } from '@/components/RoundSettingsFields';
import { Screen } from '@/components/Screen';
import { ShuffleBaseWordButton } from '@/components/ShuffleBaseWordButton';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
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
import { usePlayerOnlinePresence } from '@/lib/online/use-player-online-presence';
import type { UniqueBonusMode } from '@/lib/game/scoring';

const MIN_BASE_WORD_LENGTH = 6;
const SUGGEST_DROPDOWN_LIMIT = 50;

/**
 * Rotating base-word picker (one player per round, join order).
 */
export default function OnlinePickWordScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { buttonSize: headerButtonSize } = useHeaderIconButtonLayout();
  const { t } = useTranslation();
  const { gameId: rawGameId } = useLocalSearchParams<{ gameId: string }>();
  const gameId = rawGameId ?? '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<GameSessionSnapshot | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [dictionary, setDictionary] = useState<DictionaryIndex | null>(null);
  const [baseWords, setBaseWords] = useState<string[]>([]);
  const [baseWordInput, setBaseWordInput] = useState('');
  const [baseWordFocused, setBaseWordFocused] = useState(false);
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
    return subscribeGameSession(gameId, setSession);
  }, [gameId]);

  usePlayerOnlinePresence(gameId, myUid ?? undefined, Boolean(gameId && myUid));

  useEffect(() => {
    if (!session || !myUid) {
      return;
    }
    if (session.status !== 'waiting') {
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
      return;
    }
    if (!isCurrentBaseWordPicker(session, myUid)) {
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
    }
  }, [gameId, myUid, session]);

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
      setBaseWordInput(
        dictionary.lookupDisplayUpper(session.baseWord) ?? session.baseWord.toUpperCase(),
      );
    } else {
      const initial = randomBaseWord(baseWords);
      if (initial) {
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
  const suggestMoreLabel = t('game.baseWordSuggestMore', {
    count: Math.max(0, suggestionResult.total - suggestionResult.items.length),
  });
  const dictionaryOptionsLocked = session ? sessionContentSafetyLocked(session) : false;
  const baseWordDictionaryRequired = dictionaryOptionsLocked;
  const baseWordAllowed = baseWordDictionaryRequired
    ? isPublicBaseWordSafeFromDisplay(baseWordInput, baseWords)
    : true;
  const canSave =
    letterCount(baseWordInput) >= MIN_BASE_WORD_LENGTH && Boolean(myUid) && baseWordAllowed;
  const playerCount = session ? Object.keys(session.players).length : 1;

  const handleBack = useCallback(() => {
    router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
  }, [gameId]);

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
      router.replace({ pathname: '/online/lobby/[gameId]', params: { gameId } });
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

        <Text style={styles.hint}>{t('game.baseWordHint')}</Text>
        {baseWordDictionaryRequired ? (
          <Text style={styles.hint}>{t('online.publicRoomNeedsSafeBaseWord')}</Text>
        ) : null}

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
          label={t('online.continueToLobby')}
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
    hint: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    error: {
      color: '#E24B4A',
      fontSize: 14,
    },
  });
}
