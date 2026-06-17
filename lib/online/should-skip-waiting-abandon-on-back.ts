import { normalizeRoomCode } from '@/lib/firebase/room-code';

export type BackNavigationRoute = {
  key?: string;
  name?: string;
  params?: Record<string, unknown>;
};

export type BackNavigationState = {
  index?: number;
  routes: BackNavigationRoute[];
};

function isSetupRouteName(name: string): boolean {
  return name === 'setup' || name.endsWith('/setup') || name.includes('setup');
}

/**
 * Organizer returning lobby → setup should keep the waiting room alive.
 */
export function shouldSkipWaitingAbandonOnBack(
  navigationState: BackNavigationState,
  gameId: string,
): boolean {
  const index = navigationState.index ?? 0;
  if (index < 1) {
    return false;
  }

  const previous = navigationState.routes[index - 1];
  if (!previous) {
    return false;
  }

  const routeName = previous.name ?? '';
  if (!isSetupRouteName(routeName)) {
    return false;
  }

  const params = previous.params ?? {};
  const previousGameId =
    typeof params.gameId === 'string' ? normalizeRoomCode(params.gameId) : null;

  return previousGameId == null || previousGameId === normalizeRoomCode(gameId);
}
