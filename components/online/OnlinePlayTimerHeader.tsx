import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { GamePlayStatusBar } from '@/components/GamePlayStatusBar';
import { spacing } from '@/constants/theme';
import { useServerNow } from '@/hooks/useServerNow';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { formatTimerMs } from '@/lib/game/timer-label';
import type { FeedbackMode } from '@/lib/settings/feedback-mode';

export type OnlinePlayTimerHeaderProps = {
  timerEndsAt: number | null;
  pauseFrozenRemainingMs: number | null;
  isPaused: boolean;
  roundActive: boolean;
  rank: number;
  wordCount: number;
  maxWordCount: number | null;
  score: number;
  showRank: boolean;
  showScore: boolean;
  roundEnded: boolean;
  canProposeAddTime: boolean;
  hasOpponent: boolean;
  timerAlertMode: FeedbackMode;
  onOpenGameMenu: () => void;
  onOpenAddTimeModal: () => void;
  onOpenStandings: () => void;
};

/**
 * Status bar + ticking round timer — isolated so the word list does not re-render every 250ms.
 */
export const OnlinePlayTimerHeader = memo(function OnlinePlayTimerHeader({
  timerEndsAt,
  pauseFrozenRemainingMs,
  isPaused,
  roundActive,
  rank,
  wordCount,
  maxWordCount,
  score,
  showRank,
  showScore,
  roundEnded,
  canProposeAddTime,
  hasOpponent,
  timerAlertMode,
  onOpenGameMenu,
  onOpenAddTimeModal,
  onOpenStandings,
}: OnlinePlayTimerHeaderProps) {
  const { t } = useTranslation();
  const serverNow = useServerNow(250);

  const remainingMs = useMemo(() => {
    if (isPaused) {
      return pauseFrozenRemainingMs ?? 0;
    }
    if (timerEndsAt == null) {
      return 0;
    }
    return Math.max(0, timerEndsAt - serverNow);
  }, [isPaused, pauseFrozenRemainingMs, serverNow, timerEndsAt]);

  const remainingLabel = formatTimerMs(remainingMs);
  const timerUrgent = remainingMs > 0 && remainingMs <= 60_000;

  useTimerAlerts(remainingMs, isPaused, timerAlertMode, roundActive);

  return (
    <GamePlayStatusBar
      timerLabel={remainingLabel}
      timerUrgent={timerUrgent && !isPaused}
      rank={rank}
      wordCount={wordCount}
      maxWordCount={maxWordCount}
      score={score}
      wordsShort={t('game.wordsShort')}
      pointsShort={t('game.pointsShort')}
      showRank={showRank}
      showScore={showScore}
      menuLabel={t('game.menu')}
      onMenuPress={!roundEnded ? onOpenGameMenu : undefined}
      onAddTimePress={canProposeAddTime ? onOpenAddTimeModal : undefined}
      addTimeAccessibilityLabel={t('game.addTimeTitle')}
      onStandingsPress={hasOpponent && !roundEnded ? onOpenStandings : undefined}
      standingsAccessibilityLabel={t('game.standings')}
      style={{ marginHorizontal: -spacing.md }}
    />
  );
});
