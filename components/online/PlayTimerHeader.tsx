import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { GamePlayStatusBar } from '@/components/GamePlayStatusBar';
import { spacing } from '@/constants/theme';
import { useServerNowWhen } from '@/hooks/useServerNow';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { formatTimerMs } from '@/lib/game/timer-label';
import type { FeedbackMode } from '@/lib/settings/feedback-mode';

type PlayTimerHeaderBaseProps = {
  isPaused: boolean;
  roundActive: boolean;
  wordCount: number;
  maxWordCount: number | null;
  score: number;
  timerAlertMode: FeedbackMode;
  onOpenGameMenu: () => void;
  onOpenAddTimeModal: () => void;
};

export type PlayTimerHeaderServerProps = PlayTimerHeaderBaseProps & {
  clock: 'server';
  timerEndsAt: number | null;
  pauseFrozenRemainingMs: number | null;
  rank: number;
  showRank: boolean;
  showScore: boolean;
  roundEnded: boolean;
  canProposeAddTime: boolean;
  hasOpponent: boolean;
  onOpenStandings: () => void;
  /** Solo-style stats explainer, shown until an opponent joins (matches training). */
  onOpenStatsExplain?: () => void;
};

export type PlayTimerHeaderLocalProps = PlayTimerHeaderBaseProps & {
  clock: 'local';
  endsAt: number | null;
  getRemainingMs: (now: number) => number;
  onTimeUp: () => void;
  onOpenStatsExplain?: () => void;
};

export type PlayTimerHeaderProps = PlayTimerHeaderServerProps | PlayTimerHeaderLocalProps;

function useLocalTimerNow(enabled: boolean, roundActive: boolean, isPaused: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !roundActive || isPaused) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [enabled, isPaused, roundActive]);

  return now;
}

/**
 * Status bar + ticking round timer — isolated so the word list does not re-render every tick.
 */
export const PlayTimerHeader = memo(function PlayTimerHeader(props: PlayTimerHeaderProps) {
  const { t } = useTranslation();
  const isServerClock = props.clock === 'server';
  const serverNow = useServerNowWhen(isServerClock, 250);
  const localNow = useLocalTimerNow(!isServerClock, props.roundActive, props.isPaused);
  const now = isServerClock ? serverNow : localNow;
  const timeUpHandledRef = useRef(false);

  const remainingMs = useMemo(() => {
    if (props.clock === 'server') {
      if (props.isPaused) {
        return props.pauseFrozenRemainingMs ?? 0;
      }
      if (props.timerEndsAt == null) {
        return 0;
      }
      return Math.max(0, props.timerEndsAt - now);
    }
    return props.getRemainingMs(now);
  }, [now, props]);

  const remainingLabel = formatTimerMs(remainingMs);
  const timerUrgent = remainingMs > 0 && remainingMs <= 60_000;
  const timerCritical = remainingMs > 0 && remainingMs <= 10_000;

  useTimerAlerts(remainingMs, props.isPaused, props.timerAlertMode, props.roundActive);

  useEffect(() => {
    if (props.clock !== 'local') {
      return;
    }
    const { endsAt, isPaused, onTimeUp, roundActive } = props;
    if (!roundActive || isPaused || endsAt === null || now < endsAt || timeUpHandledRef.current) {
      return;
    }
    timeUpHandledRef.current = true;
    onTimeUp();
  }, [now, props]);

  const menuDisabled = props.clock === 'server' && props.roundEnded;

  return (
    <GamePlayStatusBar
      timerLabel={remainingLabel}
      timerUrgent={timerUrgent && !props.isPaused}
      timerCritical={timerCritical && !props.isPaused}
      rank={props.clock === 'server' ? props.rank : 1}
      wordCount={props.wordCount}
      maxWordCount={props.maxWordCount}
      score={props.score}
      wordsShort={t('game.wordsShort')}
      pointsShort={t('game.pointsShort')}
      showRank={props.clock === 'server' ? props.showRank : false}
      showScore={props.clock === 'server' ? props.showScore : false}
      menuLabel={t('game.menu')}
      onMenuPress={menuDisabled ? undefined : props.onOpenGameMenu}
      onAddTimePress={
        props.clock === 'server'
          ? props.canProposeAddTime
            ? props.onOpenAddTimeModal
            : undefined
          : props.onOpenAddTimeModal
      }
      addTimeAccessibilityLabel={t('game.addTimeTitle')}
      onStandingsPress={
        props.clock === 'server' && props.hasOpponent && !props.roundEnded
          ? props.onOpenStandings
          : undefined
      }
      standingsAccessibilityLabel={t('game.standings')}
      onStatsPress={
        props.clock === 'local'
          ? props.onOpenStatsExplain
          : // Multiplayer before anyone joins mirrors solo: tap the stats to explain them.
            !props.hasOpponent && !props.roundEnded
            ? props.onOpenStatsExplain
            : undefined
      }
      statsAccessibilityLabel={t('game.statsExplainTitle')}
      style={{ marginHorizontal: -spacing.md }}
    />
  );
});
