import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';

import { PUBLIC_LOBBY_MAX_PLAYERS } from './constants.js';
import { rosterJoinOrder, sessionIdentityMasked } from './session-identity.js';

/**
 * Format session pseudonym for strangers in public rooms.
 */
export function formatPublicAlias(n: number, locale = 'uk-uk'): string {
  if (locale.startsWith('uk')) {
    return `Гравець ${n}`;
  }
  return `Player ${n}`;
}

/** Collect assigned aliases from roster. */
export function collectPublicAliases(players: Record<string, GameSessionPlayer>): string[] {
  return Object.values(players)
    .map((player) => player.publicAlias)
    .filter((alias): alias is string => Boolean(alias));
}

/**
 * Next free pseudonym «Гравець 1»…«Гравець 8» for public join.
 */
export function nextPublicAlias(usedAliases: readonly string[], locale = 'uk-uk'): string {
  const used = new Set(usedAliases);
  for (let n = 1; n <= PUBLIC_LOBBY_MAX_PLAYERS; n += 1) {
    const alias = formatPublicAlias(n, locale);
    if (!used.has(alias)) {
      return alias;
    }
  }
  throw new Error('NO_PUBLIC_ALIAS');
}

/**
 * Assign «Гравець 1»…n in join order (organizer is first when they created the room).
 */
export function publicAliasAssignmentsForRoster(
  session: Pick<GameSession, 'organizerId' | 'players' | 'baseWordPickerOrder'>,
  locale = 'uk-uk',
): Record<string, string> {
  const updates: Record<string, string> = {};
  rosterJoinOrder(session).forEach((uid, index) => {
    const alias = formatPublicAlias(index + 1, locale);
    if (session.players[uid]?.publicAlias !== alias) {
      updates[uid] = alias;
    }
  });
  return updates;
}

export function needsPublicAliasReconcile(
  session: Pick<
    GameSession,
    'identityMasked' | 'isPublic' | 'organizerId' | 'players' | 'baseWordPickerOrder' | 'settings'
  >,
): boolean {
  if (!sessionIdentityMasked(session) && !session.isPublic) {
    return false;
  }
  return (
    Object.keys(publicAliasAssignmentsForRoster(session, session.settings.language)).length > 0
  );
}
