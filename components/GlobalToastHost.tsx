import { useEffect } from 'react';

import { PlaySessionToastStack } from '@/components/PlaySessionToast';
import { useToastQueue } from '@/hooks/useToastQueue';
import { useToastStore } from '@/store/toast-store';

export function GlobalToastHost() {
  const { toasts, enqueueToasts } = useToastQueue();
  const pendingToasts = useToastStore((state) => state.pendingToasts);
  const consumeToasts = useToastStore((state) => state.consumeToasts);

  useEffect(() => {
    if (pendingToasts.length > 0) {
      /**
       * consumeToasts() clears the Zustand store (atomic set).
       * enqueueToasts() updates the INTERNAL React state of useToastQueue.
       * This separation ensures we don't trigger an infinite update loop.
       */
      enqueueToasts(consumeToasts());
    }
  }, [pendingToasts, consumeToasts, enqueueToasts]);

  return <PlaySessionToastStack toasts={toasts} anchor="bottom" bottomOffset={64} />;
}
