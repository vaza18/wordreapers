import { useTranslation } from 'react-i18next';

import { CenterDialogModal } from '@/components/CenterDialogModal';

interface GameTimeUpModalProps {
  visible: boolean;
  onViewResults: () => void;
  /** True while ensure/navigate is in flight (online play). */
  viewResultsBusy?: boolean;
  /** Ensure/navigate failure — shown in the modal (not under it). */
  viewResultsError?: string | null;
  /** Escape hatch when results cannot open (online). */
  onGoHome?: () => void;
}

/**
 * Round-over dialog (timer or voted finish) — solo and online share this modal.
 * Cannot be dismissed without viewing results, unless results failed and Home is offered.
 */
export function GameTimeUpModal({
  visible,
  onViewResults,
  viewResultsBusy = false,
  viewResultsError = null,
  onGoHome,
}: GameTimeUpModalProps) {
  const { t } = useTranslation();
  const showHomeEscape = Boolean(viewResultsError && onGoHome);

  return (
    <CenterDialogModal
      visible={visible}
      title={t('game.timeUpTitle')}
      body={t('game.timeUpBody')}
      errorBody={viewResultsError}
      primaryLabel={viewResultsBusy ? t('game.viewResultsOpening') : t('game.viewResults')}
      onPrimary={onViewResults}
      primaryDisabled={viewResultsBusy}
      secondaryLabel={showHomeEscape ? t('nav.home') : undefined}
      onSecondary={showHomeEscape ? onGoHome : undefined}
      dismissOnBackdrop={false}
      animateEntrance
    />
  );
}
