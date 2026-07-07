import { describe, expect, it } from 'vitest';

import {
  assertLobbyVisiblePlayerState,
  assertRematchBootstrapSessionShape,
  assertRematchWaitingPlayerPatch,
  shouldAssertOnlineInvariants,
} from '../lib/online/invariants.js';

describe('online invariants', () => {
  it('runs assertions in test environment', () => {
    expect(shouldAssertOnlineInvariants()).toBe(true);
  });

  it('accepts valid rematch waiting player patches', () => {
    expect(() =>
      assertRematchWaitingPlayerPatch('a', true, { online: true, hasLeft: false }),
    ).not.toThrow();
    expect(() =>
      assertRematchWaitingPlayerPatch('b', false, { online: false, hasLeft: false }),
    ).not.toThrow();
  });

  it('rejects invalid rematch waiting player patches', () => {
    expect(() =>
      assertRematchWaitingPlayerPatch('a', true, { online: false, hasLeft: false }),
    ).toThrow(/opted-in player must be online/);
    expect(() =>
      assertRematchWaitingPlayerPatch('b', false, { online: true, hasLeft: false }),
    ).toThrow(/non-opt-in player must be offline/);
    expect(() =>
      assertRematchWaitingPlayerPatch('c', false, { online: false, hasLeft: true }),
    ).toThrow(/hasLeft must be false/);
  });

  it('validates rematch bootstrap session shape', () => {
    expect(() =>
      assertRematchBootstrapSessionShape({
        status: 'waiting',
        baseWord: '',
        timerEndsAt: null,
        organizerId: 'org',
        settings: {
          durationSeconds: 300,
          uniqueBonusEnabled: false,
          language: 'uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {},
      }),
    ).not.toThrow();

    expect(() =>
      assertRematchBootstrapSessionShape({
        status: 'finished',
        baseWord: '',
        timerEndsAt: null,
        organizerId: 'org',
        settings: {
          durationSeconds: 300,
          uniqueBonusEnabled: false,
          language: 'uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {},
        resultsExitedBy: { org: true },
      }),
    ).toThrow(/must be waiting/);
  });

  it('rejects lobby visibility for hasLeft players', () => {
    expect(() =>
      assertLobbyVisiblePlayerState(
        'p',
        { name: 'P', wordCount: 0, score: 0, hasLeft: true },
        true,
      ),
    ).toThrow(/hasLeft players must not be visible/);
  });
});
