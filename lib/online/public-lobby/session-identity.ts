import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';

import type { PlayerGender } from '../../game/grammar.js';

/** Permanent after someone joins from the public browse list. */
export function sessionHadPublicBrowseExposure(
  session: Pick<GameSession, 'identityMasked' | 'players'>,
): boolean {
  if (session.identityMasked === true) {
    return true;
  }
  return Object.values(session.players).some((player) => player.joinedVia === 'browse');
}

export function sessionIdentityMasked(
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
): boolean {
  if (sessionHadPublicBrowseExposure(session)) {
    return true;
  }
  return session.isPublic === true;
}

/** Join order from `baseWordPickerOrder`, then any stragglers by uid. */
export function rosterJoinOrder(
  session: Pick<GameSession, 'organizerId' | 'players' | 'baseWordPickerOrder'>,
): string[] {
  const order = session.baseWordPickerOrder ?? [session.organizerId];
  const ids = new Set(Object.keys(session.players));
  const sorted = order.filter((uid) => ids.has(uid));
  for (const uid of Object.keys(session.players).sort()) {
    if (!sorted.includes(uid)) {
      sorted.push(uid);
    }
  }
  return sorted;
}

export function comparePlayersByJoinOrder(
  a: { uid: string },
  b: { uid: string },
  joinOrder: readonly string[],
): number {
  const ai = joinOrder.indexOf(a.uid);
  const bi = joinOrder.indexOf(b.uid);
  const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
  const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  return a.uid.localeCompare(b.uid);
}

/** Gender for UI agreement; pseudonyms «Гравець N» use masculine forms. */
export function playerGenderForDisplay(
  session: Pick<GameSession, 'players' | 'identityMasked' | 'isPublic'>,
  viewerUid: string,
  playerUid: string,
): PlayerGender | null {
  if (playerUid === viewerUid) {
    const gender = session.players[playerUid]?.gender;
    return gender === 'm' || gender === 'f' ? gender : null;
  }
  if (shouldMaskPlayerIdentity(session, viewerUid, playerUid)) {
    return 'm';
  }
  const gender = session.players[playerUid]?.gender;
  return gender === 'm' || gender === 'f' ? gender : null;
}

export function shouldMaskPlayerIdentity(
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
  viewerUid: string,
  playerUid: string,
): boolean {
  if (playerUid === viewerUid) {
    return false;
  }
  return sessionIdentityMasked(session);
}

export function maskedDisplayName(
  player: Pick<GameSessionPlayer, 'publicAlias'> & { name?: string },
  playerUid: string,
  viewerUid: string,
  session: Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'>,
): string {
  if (!shouldMaskPlayerIdentity(session, viewerUid, playerUid)) {
    return player.name ?? player.publicAlias ?? '';
  }
  return player.publicAlias ?? player.name ?? '';
}
