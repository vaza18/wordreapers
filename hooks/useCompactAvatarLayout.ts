import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { playableLayoutSize } from '@/lib/typography/font-scale';

/** Layout box for compact avatar rows (word list / results) that scale with accessibility. */
export function useCompactAvatarLayout(designDiameter: number, designGap = 4) {
  const { width, fontScale } = useWindowDimensions();

  return useMemo(
    () => ({
      diameter: playableLayoutSize(designDiameter, fontScale, width),
      gap: playableLayoutSize(designGap, fontScale, width),
    }),
    [designDiameter, designGap, fontScale, width],
  );
}
