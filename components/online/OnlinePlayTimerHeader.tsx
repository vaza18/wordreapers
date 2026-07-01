import {
  PlayTimerHeader,
  type PlayTimerHeaderServerProps,
} from '@/components/online/PlayTimerHeader';

export type OnlinePlayTimerHeaderProps = Omit<PlayTimerHeaderServerProps, 'clock'>;

/** Status bar + ticking round timer — isolated so the word list does not re-render every 250ms. */
export const OnlinePlayTimerHeader = (props: OnlinePlayTimerHeaderProps) => (
  <PlayTimerHeader clock="server" {...props} />
);
