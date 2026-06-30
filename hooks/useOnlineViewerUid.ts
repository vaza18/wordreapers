import { useEffect, useState } from 'react';

import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { useFirebaseStore } from '@/store/firebase-store';

/** Resolve Firebase uid for online results / left screens. */
export function useOnlineViewerUid(): string {
  const storeUid = useFirebaseStore((state) => state.uid);
  const [resolvedUid, setResolvedUid] = useState(storeUid ?? '');

  useEffect(() => {
    void ensureAnonymousAuth().then((user) => {
      setResolvedUid(user.uid);
    });
  }, []);

  return resolvedUid || storeUid || '';
}
