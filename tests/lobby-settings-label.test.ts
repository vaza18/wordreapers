import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { formatLobbySettingsLabel } from '../lib/online/lobby-settings-label.js';

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === 'online.lobbySettingsSummary') {
    return `${params?.minutes} хв • бонус x2 ${params?.uniqueBonus} • ${params?.proper} • ${params?.slang}`;
  }
  if (key === 'online.lobbySettingsSummaryNoBonus') {
    return `${params?.minutes} хв • ${params?.proper} • ${params?.slang}`;
  }
  if (key === 'online.lobbyUniqueBonusOn') {
    return 'увімк.';
  }
  if (key === 'online.lobbyUniqueBonusOff') {
    return 'вимк.';
  }
  if (key === 'online.lobbyProperOn') {
    return 'власні назви';
  }
  if (key === 'online.lobbyProperOff') {
    return 'без назв';
  }
  if (key === 'online.lobbySlangOn') {
    return 'сленг';
  }
  if (key === 'online.lobbySlangOff') {
    return 'без сленгу';
  }
  return key;
};

function sessionWithPlayers(
  count: number,
  overrides: Partial<GameSession['settings']> = {},
): Pick<GameSession, 'settings' | 'players' | 'status'> {
  const players: GameSession['players'] = {};
  for (let i = 0; i < count; i += 1) {
    players[`p${i}`] = { name: `P${i}`, wordCount: 0, score: 0, online: true };
  }
  return {
    status: 'waiting',
    settings: {
      durationSeconds: 600,
      uniqueBonusMode: 'auto',
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: true,
      allowSlang: true,
      ...overrides,
    },
    players,
  };
}

describe('formatLobbySettingsLabel', () => {
  it('omits bonus segment for auto mode with fewer than 3 lobby-visible players', () => {
    expect(formatLobbySettingsLabel(t, sessionWithPlayers(2))).toBe('10 хв • власні назви • сленг');
  });

  it('shows bonus on for auto mode with three players', () => {
    expect(formatLobbySettingsLabel(t, sessionWithPlayers(3))).toContain('бонус x2 увімк.');
  });

  it('shows bonus off when mode is explicitly off', () => {
    expect(
      formatLobbySettingsLabel(t, sessionWithPlayers(2, { uniqueBonusMode: 'off' })),
    ).toContain('бонус x2 вимк.');
  });

  it('omits bonus after voluntary leave drops visible roster below 3 in auto mode', () => {
    const session = sessionWithPlayers(2);
    session.players.left = {
      name: 'Left',
      wordCount: 0,
      score: 0,
      online: false,
      hasLeft: true,
    };
    session.settings = {
      ...session.settings!,
      uniqueBonusEnabled: true,
      uniqueBonusMode: 'auto',
    };
    expect(formatLobbySettingsLabel(t, session)).toBe('10 хв • власні назви • сленг');
  });
});
