import { useTranslation } from 'react-i18next';

import { CenterDialogModal } from '@/components/CenterDialogModal';

interface GameTimeUpModalProps {
  visible: boolean;
  onViewResults: () => void;
}

/**
 * Round-over dialog (timer or voted finish) — solo and online share this modal.
 * Cannot be dismissed without viewing results.
 */
export function GameTimeUpModal({ visible, onViewResults }: GameTimeUpModalProps) {
  const { t } = useTranslation();

  return (
    <CenterDialogModal
      visible={visible}
      title={t('game.timeUpTitle')}
      body={t('game.timeUpBody')}
      primaryLabel={t('game.viewResults')}
      onPrimary={onViewResults}
      dismissOnBackdrop={false}
    />
  );
}
