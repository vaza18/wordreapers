import { ensureAnonymousAuth } from '@/lib/firebase/auth';
import { abandonWaitingGameSession } from '@/lib/firebase/game-session-service';
import { navigateHomeWithBackAnimation } from '@/lib/navigation/navigate-home';

import { abandonTrackedOrganizerWaitingRoom } from './abandon-tracked-waiting-room';
import { setOrganizerWaitingRoom } from './organizer-waiting-room';

/**
 * Organizer leaves initial setup (home → create game → setup → back).
 * Cleans up Firebase first, then navigates home.
 */
export async function leaveOrganizerSetupToHome(gameId: string): Promise<void> {
  try {
    const user = await ensureAnonymousAuth();
    if (gameId) {
      await abandonWaitingGameSession(gameId, user.uid);
    }
    await abandonTrackedOrganizerWaitingRoom(user.uid);
    setOrganizerWaitingRoom(null);
  } catch (error) {
    if (__DEV__) {
      console.warn('leaveOrganizerSetupToHome cleanup', error);
    }
  } finally {
    navigateHomeWithBackAnimation();
  }
}
