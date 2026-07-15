import { describe, expect, it } from 'vitest';

import {
  isGameMenuBlockedByVote,
  isPauseUiObscuredByOverlays,
} from '../lib/online/play-menu-gates.js';

describe('isGameMenuBlockedByVote', () => {
  it('blocks during resume vote while paused', () => {
    expect(
      isGameMenuBlockedByVote({
        pauseVote: null,
        earlyVote: null,
        addTimeVote: null,
        isPaused: true,
        resumeVote: { proposedBy: 'a' },
      }),
    ).toBe(true);
  });

  it('does not block resume vote when not paused', () => {
    expect(
      isGameMenuBlockedByVote({
        pauseVote: null,
        earlyVote: null,
        addTimeVote: null,
        isPaused: false,
        resumeVote: { proposedBy: 'a' },
      }),
    ).toBe(false);
  });

  it('blocks during pause / early-finish / add-time votes', () => {
    expect(
      isGameMenuBlockedByVote({
        pauseVote: { proposedBy: 'a' },
        earlyVote: null,
        addTimeVote: null,
        isPaused: false,
        resumeVote: null,
      }),
    ).toBe(true);
    expect(
      isGameMenuBlockedByVote({
        pauseVote: null,
        earlyVote: { proposedBy: 'a' },
        addTimeVote: null,
        isPaused: true,
        resumeVote: null,
      }),
    ).toBe(true);
    expect(
      isGameMenuBlockedByVote({
        pauseVote: null,
        earlyVote: null,
        addTimeVote: { proposedBy: 'a' },
        isPaused: false,
        resumeVote: null,
      }),
    ).toBe(true);
  });
});

describe('isPauseUiObscuredByOverlays', () => {
  it('does not hide pause when menu is requested but blocked by vote (avoids blank screen)', () => {
    expect(
      isPauseUiObscuredByOverlays({
        showGameMenu: true,
        gameMenuBlockedByVote: true,
        showInviteModal: false,
        showExitConfirm: false,
        showEndEarlyConfirm: false,
        hasOnlineOpponentInRound: true,
      }),
    ).toBe(false);
  });

  it('hides pause when game menu is actually shown', () => {
    expect(
      isPauseUiObscuredByOverlays({
        showGameMenu: true,
        gameMenuBlockedByVote: false,
        showInviteModal: false,
        showExitConfirm: false,
        showEndEarlyConfirm: false,
        hasOnlineOpponentInRound: true,
      }),
    ).toBe(true);
  });

  it('hides pause for invite and exit confirm overlays', () => {
    expect(
      isPauseUiObscuredByOverlays({
        showGameMenu: false,
        gameMenuBlockedByVote: false,
        showInviteModal: true,
        showExitConfirm: false,
        showEndEarlyConfirm: false,
        hasOnlineOpponentInRound: true,
      }),
    ).toBe(true);
    expect(
      isPauseUiObscuredByOverlays({
        showGameMenu: false,
        gameMenuBlockedByVote: false,
        showInviteModal: false,
        showExitConfirm: true,
        showEndEarlyConfirm: false,
        hasOnlineOpponentInRound: true,
      }),
    ).toBe(true);
  });
});
