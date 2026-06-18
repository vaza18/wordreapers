import * as Linking from 'expo-linking';

import { normalizeRoomCode } from '@/lib/firebase/room-code';

/**
 * Deep link / universal URL for scanning QR to open join with room code prefilled.
 */
export function buildRoomJoinUrl(code: string, invitedByUid?: string): string {
  const normalized = normalizeRoomCode(code);
  const queryParams: Record<string, string> = { code: normalized };
  if (invitedByUid) {
    queryParams.invitedBy = invitedByUid;
  }
  return Linking.createURL('/online/join', { queryParams });
}
