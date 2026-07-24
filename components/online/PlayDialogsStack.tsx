import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';

import { AddTimeModal } from '@/components/AddTimeModal';
import { CenterDialogModal } from '@/components/CenterDialogModal';
import { GameTimeUpModal } from '@/components/GameTimeUpModal';
import { HowToPlayDialog } from '@/components/HowToPlayDialog';
import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import type { PlayToastItem } from '@/hooks/usePlaySessionToasts';

export type PlayDialogsStackProps = {
  t: TFunction;
  roundEnded: boolean;
  isPaused: boolean;
  sessionPlaying: boolean;
  canProposeAddTime: boolean;
  showAddTimeModal: boolean;
  addTimeRemainingMs: number;
  hasOpponent: boolean;
  onCloseAddTime: () => void;
  onSelectAddTime: (minutes: number) => void | Promise<void>;
  showEndEarlyConfirm: boolean;
  hasOnlineOpponentInRound: boolean;
  onEndEarlyConfirm: () => void;
  onDismissEndEarlyConfirm: () => void;
  showExitConfirm: boolean;
  onLeaveToHome: () => void;
  onDismissExitConfirm: () => void;
  sessionToasts: PlayToastItem[];
  timeUpModalVisible: boolean;
  onViewResults: () => void;
  viewResultsBusy?: boolean;
  viewResultsError?: string | null;
  onGoHomeFromTimeUp?: () => void;
  extra?: ReactNode;
};

/** Secondary play-screen dialogs — isolated from the main render tree. */
export function PlayDialogsStack({
  t,
  roundEnded,
  isPaused,
  sessionPlaying,
  canProposeAddTime,
  showAddTimeModal,
  addTimeRemainingMs,
  hasOpponent,
  onCloseAddTime,
  onSelectAddTime,
  showEndEarlyConfirm,
  hasOnlineOpponentInRound,
  onEndEarlyConfirm,
  onDismissEndEarlyConfirm,
  showExitConfirm,
  onLeaveToHome,
  onDismissExitConfirm,
  sessionToasts,
  timeUpModalVisible,
  onViewResults,
  viewResultsBusy = false,
  viewResultsError = null,
  onGoHomeFromTimeUp,
  extra,
}: PlayDialogsStackProps) {
  return (
    <>
      {extra}

      <AddTimeModal
        visible={showAddTimeModal && canProposeAddTime && !roundEnded}
        remainingMs={addTimeRemainingMs}
        requiresConsensus={hasOpponent}
        onClose={onCloseAddTime}
        onSelect={onSelectAddTime}
      />

      <CenterDialogModal
        visible={showEndEarlyConfirm && !hasOnlineOpponentInRound && !roundEnded}
        title={t('game.endEarlyConfirmTitle')}
        body={t('game.endEarlyConfirmBody')}
        primaryLabel={t('game.endEarlyConfirmAction')}
        onPrimary={onEndEarlyConfirm}
        secondaryLabel={t('common.cancel')}
        onSecondary={onDismissEndEarlyConfirm}
        onRequestClose={onDismissEndEarlyConfirm}
      />

      <CenterDialogModal
        visible={showExitConfirm && !roundEnded}
        title={t('online.exitConfirmTitle')}
        body={t('online.exitConfirmBody')}
        primaryLabel={t('online.exitConfirmAction')}
        onPrimary={onLeaveToHome}
        secondaryLabel={t('common.cancel')}
        onSecondary={onDismissExitConfirm}
        onRequestClose={onDismissExitConfirm}
      />

      <PlaySessionToastStack toasts={sessionToasts} />

      <HowToPlayDialog enabled={sessionPlaying && !isPaused} />

      <GameTimeUpModal
        visible={timeUpModalVisible}
        onViewResults={onViewResults}
        viewResultsBusy={viewResultsBusy}
        viewResultsError={viewResultsError}
        onGoHome={onGoHomeFromTimeUp}
      />
    </>
  );
}
