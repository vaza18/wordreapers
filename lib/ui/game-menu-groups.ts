/** Stable id for one in-game menu row. */
export type GameMenuItemId = 'pause' | 'invite' | 'endGame' | 'exit' | 'howToPlay';

/** Menu section used for inter-group hairline dividers. */
export type GameMenuGroupId = 'session' | 'leave' | 'other';

/** One menu row definition (icon lives in UI; label comes from i18n). */
export interface GameMenuItemDef {
  id: GameMenuItemId;
  icon: string;
}

/** Non-empty menu group for Variant C layout. */
export interface GameMenuGroup {
  id: GameMenuGroupId;
  items: GameMenuItemDef[];
}

/** Visibility flags matching GameMenuModal props (after optional-callback gates). */
export interface GameMenuVisibility {
  showPause?: boolean;
  showInvite?: boolean;
  showEndGame?: boolean;
  showExit?: boolean;
  showHowToPlay?: boolean;
}

const PAUSE: GameMenuItemDef = { id: 'pause', icon: '⏸' };
const INVITE: GameMenuItemDef = { id: 'invite', icon: '▦' };
const END_GAME: GameMenuItemDef = { id: 'endGame', icon: '🏁' };
const EXIT: GameMenuItemDef = { id: 'exit', icon: '⎋' };
const HOW_TO_PLAY: GameMenuItemDef = { id: 'howToPlay', icon: '?' };

/**
 * Builds Variant C in-game menu groups (session → other → leave).
 * Leave actions stay last; settings open from the header gear, not the list.
 * Empty groups are omitted so callers can place hairline dividers between groups only.
 * Dismiss is via modal ✕ / overlay — no “continue” row.
 */
export function buildGameMenuGroups(visibility: GameMenuVisibility = {}): GameMenuGroup[] {
  const {
    showPause = false,
    showInvite = false,
    showEndGame = false,
    showExit = false,
    showHowToPlay = false,
  } = visibility;

  const groups: GameMenuGroup[] = [];

  const session: GameMenuItemDef[] = [];
  if (showPause) session.push(PAUSE);
  if (showInvite) session.push(INVITE);
  if (session.length > 0) groups.push({ id: 'session', items: session });

  const other: GameMenuItemDef[] = [];
  if (showHowToPlay) other.push(HOW_TO_PLAY);
  if (other.length > 0) groups.push({ id: 'other', items: other });

  const leave: GameMenuItemDef[] = [];
  if (showEndGame) leave.push(END_GAME);
  if (showExit) leave.push(EXIT);
  if (leave.length > 0) groups.push({ id: 'leave', items: leave });

  return groups;
}
