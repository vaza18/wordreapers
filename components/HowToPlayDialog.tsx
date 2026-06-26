import { useTranslation } from 'react-i18next';

import { CenterDialogModal } from '@/components/CenterDialogModal';
import { useHowToPlayPrompt } from '@/hooks/useHowToPlayPrompt';

interface HowToPlayDialogProps {
  /** Show only when the play UI is ready (round in progress, not loading). */
  enabled: boolean;
}

/** First-run how-to-play steps shown once at the start of the first active round. */
export function HowToPlayDialog({ enabled }: HowToPlayDialogProps) {
  const { t } = useTranslation();
  const howToPlay = useHowToPlayPrompt();

  return (
    <CenterDialogModal
      visible={enabled && howToPlay.shouldShow}
      title={t('onboarding.howToPlayTitle')}
      body={`${t('onboarding.howToPlayStep1')}\n\n${t('onboarding.howToPlayStep2')}\n\n${t('onboarding.howToPlayStep3')}\n\n${t('onboarding.howToPlayStep4')}`}
      primaryLabel={t('onboarding.howToPlayDismiss')}
      onPrimary={howToPlay.dismiss}
      dismissOnBackdrop={false}
    />
  );
}
