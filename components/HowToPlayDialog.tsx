import { useTranslation } from 'react-i18next';

import { CenterDialogModal } from '@/components/CenterDialogModal';
import { useHowToPlayPrompt } from '@/hooks/useHowToPlayPrompt';

interface HowToPlayDialogProps {
  /** Show only when the play UI is ready (round in progress, not loading). */
  enabled: boolean;
  /** Menu replay — does not mark first-run as seen again. */
  forceOpen?: boolean;
  onForceDismiss?: () => void;
}

/** First-run how-to-play steps shown once at the start of the first active round. */
export function HowToPlayDialog({
  enabled,
  forceOpen = false,
  onForceDismiss,
}: HowToPlayDialogProps) {
  const { t } = useTranslation();
  const howToPlay = useHowToPlayPrompt();
  const visible = enabled && (forceOpen || howToPlay.shouldShow);

  const handleDismiss = () => {
    if (forceOpen) {
      onForceDismiss?.();
      return;
    }
    howToPlay.dismiss();
  };

  return (
    <CenterDialogModal
      visible={visible}
      title={t('onboarding.howToPlayTitle')}
      body={`${t('onboarding.howToPlayStep1')}\n\n${t('onboarding.howToPlayStep2')}\n\n${t('onboarding.howToPlayStep3')}\n\n${t('onboarding.howToPlayStep4')}`}
      primaryLabel={t('onboarding.howToPlayDismiss')}
      onPrimary={handleDismiss}
      dismissOnBackdrop={false}
    />
  );
}
