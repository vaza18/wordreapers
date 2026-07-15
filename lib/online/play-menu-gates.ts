/**
 * Gates for in-round game menu vs vote / pause overlays.
 * Menu must not hide pause UI when a blocking vote also prevents GameMenuModal from rendering
 * (otherwise players see a blank screen).
 */

/** True when vote UI should take priority over the in-round game menu. */
export function isGameMenuBlockedByVote(input: {
  pauseVote: unknown;
  earlyVote: unknown;
  addTimeVote: unknown;
  isPaused: boolean;
  resumeVote: unknown;
}): boolean {
  return Boolean(
    input.pauseVote || input.earlyVote || input.addTimeVote || (input.isPaused && input.resumeVote),
  );
}

/**
 * Whether PauseRoundModal should hide under another opaque overlay.
 * `showGameMenu` only obscures pause when the menu is actually allowed to present.
 */
export function isPauseUiObscuredByOverlays(input: {
  showGameMenu: boolean;
  gameMenuBlockedByVote: boolean;
  showInviteModal: boolean;
  showExitConfirm: boolean;
  showEndEarlyConfirm: boolean;
  hasOnlineOpponentInRound: boolean;
}): boolean {
  const menuShowing = input.showGameMenu && !input.gameMenuBlockedByVote;
  return (
    menuShowing ||
    input.showInviteModal ||
    input.showExitConfirm ||
    (input.showEndEarlyConfirm && !input.hasOnlineOpponentInRound)
  );
}
