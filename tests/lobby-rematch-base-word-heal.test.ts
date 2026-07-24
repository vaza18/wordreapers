import { describe, expect, it } from 'vitest';

import {
  LOBBY_REMATCH_BASE_WORD_HEAL_MAX_TICKS,
  shouldContinueLobbyRematchBaseWordHealTick,
  shouldRunLobbyRematchBaseWordHealPoll,
} from '../lib/online/lobby-rematch-base-word-heal.js';

describe('shouldRunLobbyRematchBaseWordHealPoll', () => {
  it('runs only for focused rematch waiting without a committed word', () => {
    expect(
      shouldRunLobbyRematchBaseWordHealPoll({
        focused: true,
        status: 'waiting',
        baseWordRound: 2,
        baseWord: '',
      }),
    ).toBe(true);
    expect(
      shouldRunLobbyRematchBaseWordHealPoll({
        focused: true,
        status: 'waiting',
        baseWordRound: 2,
        baseWord: 'хата',
      }),
    ).toBe(false);
    expect(
      shouldRunLobbyRematchBaseWordHealPoll({
        focused: true,
        status: 'waiting',
        baseWordRound: 0,
        baseWord: '',
      }),
    ).toBe(false);
    expect(
      shouldRunLobbyRematchBaseWordHealPoll({
        focused: false,
        status: 'waiting',
        baseWordRound: 2,
        baseWord: '',
      }),
    ).toBe(false);
    expect(
      shouldRunLobbyRematchBaseWordHealPoll({
        focused: true,
        status: 'playing',
        baseWordRound: 2,
        baseWord: '',
      }),
    ).toBe(false);
  });
});

describe('shouldContinueLobbyRematchBaseWordHealTick', () => {
  it('caps ticks so the poll cannot run indefinitely', () => {
    expect(shouldContinueLobbyRematchBaseWordHealTick(1)).toBe(true);
    expect(shouldContinueLobbyRematchBaseWordHealTick(LOBBY_REMATCH_BASE_WORD_HEAL_MAX_TICKS)).toBe(
      true,
    );
    expect(
      shouldContinueLobbyRematchBaseWordHealTick(LOBBY_REMATCH_BASE_WORD_HEAL_MAX_TICKS + 1),
    ).toBe(false);
    expect(shouldContinueLobbyRematchBaseWordHealTick(0)).toBe(false);
  });
});
