import type { GameSession } from '../../firebase/types.js';

type RematchNavigationRoute = {
  pathname: '/online/play/[gameId]' | '/online/lobby/[gameId]';
  params: { gameId: string };
};

/** After «Play again», skip the lobby when the room is already in an active round. */
export function resolveRematchNavigationRoute(
  sessionStatus: GameSession['status'] | undefined,
  gameId: string,
): RematchNavigationRoute {
  if (sessionStatus === 'playing') {
    return { pathname: '/online/play/[gameId]', params: { gameId } };
  }
  return { pathname: '/online/lobby/[gameId]', params: { gameId } };
}
