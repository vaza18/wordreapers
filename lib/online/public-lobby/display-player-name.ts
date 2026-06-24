import type { GameSession, GameSessionPlayer, GameSessionSettings } from '../../firebase/types.js';

import { formatPublicAlias } from './public-alias.js';
import { maskedDisplayName, rosterJoinOrder, sessionIdentityMasked } from './session-identity.js';

type DisplayPlayerNameSession = Pick<GameSession, 'identityMasked' | 'players' | 'isPublic'> & {
  organizerId?: string;
  baseWordPickerOrder?: string[];
  settings?: Pick<GameSessionSettings, 'language'>;
};

function nonEmptyLabel(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function playerLabelFallback(playerUid: string, session: DisplayPlayerNameSession): string {
  if (!session.organizerId) {
    return playerUid;
  }
  const order = rosterJoinOrder({
    organizerId: session.organizerId,
    players: session.players,
    baseWordPickerOrder: session.baseWordPickerOrder,
  });
  let index = order.indexOf(playerUid);
  if (index === -1 && session.baseWordPickerOrder) {
    index = session.baseWordPickerOrder.indexOf(playerUid);
  }
  if (index === -1) {
    return playerUid;
  }
  return formatPublicAlias(index + 1, session.settings?.language ?? 'uk-uk');
}

/**
 * Lobby/play/results label for a player; pseudonym when room identity is masked.
 */
export function displayPlayerName(
  player: (Pick<GameSessionPlayer, 'publicAlias'> & { name?: string }) | null | undefined,
  viewerUid: string,
  playerUid: string,
  session: DisplayPlayerNameSession,
): string {
  if (!player) {
    return playerLabelFallback(playerUid, session);
  }

  const realName = nonEmptyLabel(player.name);
  const alias = nonEmptyLabel(player.publicAlias);

  if (playerUid === viewerUid) {
    return realName ?? alias ?? playerLabelFallback(playerUid, session);
  }

  const masked = maskedDisplayName(player, playerUid, viewerUid, session);
  const maskedLabel = nonEmptyLabel(masked);
  if (maskedLabel && maskedLabel !== realName) {
    return maskedLabel;
  }
  if (session.isPublic && alias) {
    return alias;
  }
  return realName ?? alias ?? playerLabelFallback(playerUid, session);
}

/** How strangers see the viewer in a masked room (for self row subtitle). */
export function viewerPublicAlias(
  player: Pick<GameSessionPlayer, 'publicAlias'> | undefined,
  session: Pick<GameSession, 'identityMasked' | 'players'>,
): string | null {
  if (!sessionIdentityMasked(session)) {
    return null;
  }
  return player?.publicAlias ?? null;
}
