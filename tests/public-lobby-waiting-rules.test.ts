import { describe, expect, it } from 'vitest';

import { PUBLIC_LOBBY_TTL_MS } from '../lib/online/public-lobby/constants.js';
import {
  isPublicLobbyListingExpired,
  shouldDisableLobbyStartForPublicSolo,
} from '../lib/online/public-lobby/public-lobby-waiting-rules.js';

describe('isPublicLobbyListingExpired', () => {
  const publishedAt = 1_000_000;

  it('is false while TTL remains', () => {
    expect(isPublicLobbyListingExpired(publishedAt, publishedAt + PUBLIC_LOBBY_TTL_MS - 1)).toBe(
      false,
    );
  });

  it('is true at and after TTL', () => {
    expect(isPublicLobbyListingExpired(publishedAt, publishedAt + PUBLIC_LOBBY_TTL_MS)).toBe(true);
    expect(isPublicLobbyListingExpired(publishedAt, publishedAt + PUBLIC_LOBBY_TTL_MS + 1)).toBe(
      true,
    );
  });

  it('is false without a publish timestamp', () => {
    expect(isPublicLobbyListingExpired(null, publishedAt)).toBe(false);
    expect(isPublicLobbyListingExpired(undefined, publishedAt)).toBe(false);
  });
});

describe('shouldDisableLobbyStartForPublicSolo', () => {
  it('disables start when public and alone', () => {
    expect(shouldDisableLobbyStartForPublicSolo({ isPublic: true, lobbyPlayerCount: 1 })).toBe(
      true,
    );
  });

  it('allows start when public with a guest', () => {
    expect(shouldDisableLobbyStartForPublicSolo({ isPublic: true, lobbyPlayerCount: 2 })).toBe(
      false,
    );
  });

  it('allows start when private even if alone', () => {
    expect(shouldDisableLobbyStartForPublicSolo({ isPublic: false, lobbyPlayerCount: 1 })).toBe(
      false,
    );
    expect(shouldDisableLobbyStartForPublicSolo({ isPublic: undefined, lobbyPlayerCount: 1 })).toBe(
      false,
    );
  });
});
