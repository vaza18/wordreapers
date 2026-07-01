import {
  PlayTimerHeader,
  type PlayTimerHeaderLocalProps,
} from '@/components/online/PlayTimerHeader';

export type OrganizerSoloTimerHeaderProps = Omit<PlayTimerHeaderLocalProps, 'clock'>;

/** Status bar + ticking solo round timer — isolated so the word list does not re-render every tick. */
export const OrganizerSoloTimerHeader = (props: OrganizerSoloTimerHeaderProps) => (
  <PlayTimerHeader clock="local" {...props} />
);
