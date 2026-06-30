import { currentBaseWordPickerUid } from './base-word-picker.js';
import { isActiveLivePlayer } from './live-round-membership.js';
import type { GameSession } from '../firebase/types.js';

export interface PostJoinRoute {
  pathname:
    | '/online/play/[gameId]'
    | '/online/lobby/[gameId]'
    | '/online/results/[gameId]'
    | '/online/pick-word/[gameId]'
    | '/online/setup';
  params: { gameId: string };
}

/**
 * Where to send the player right after a successful join / rejoin.
 */
export function resolvePostJoinRoute(
  session: GameSession,
  uid: string,
  gameId: string,
): PostJoinRoute {
  if (session.status === 'playing') {
    if (isActiveLivePlayer(session, uid)) {
      return { pathname: '/online/play/[gameId]', params: { gameId } };
    }
    return { pathname: '/online/results/[gameId]', params: { gameId } };
  }
  if (session.status === 'finished') {
    return { pathname: '/online/results/[gameId]', params: { gameId } };
  }

  const isOrganizer = session.organizerId === uid;
  const isFirstRound = (session.baseWordRound ?? 0) === 0;
  const hasBaseWord = Boolean(session.baseWord && session.baseWord.length >= 2);

  if (isOrganizer && isFirstRound && !hasBaseWord) {
    return { pathname: '/online/setup', params: { gameId } };
  }
  if (currentBaseWordPickerUid(session) === uid && !hasBaseWord) {
    return { pathname: '/online/pick-word/[gameId]', params: { gameId } };
  }

  return { pathname: '/online/lobby/[gameId]', params: { gameId } };
}
