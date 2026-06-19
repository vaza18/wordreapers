import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { formatLobbySettingsLabel } from '../lib/online/lobby-settings-label.js';

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === 'online.lobbySettingsSummary') {
    return `${params?.minutes} хв · бонус x2 ${params?.uniqueBonus}`;
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

function sessionWithPlayers(count: number): Pick<GameSession, 'settings' | 'players'> {
  const players: GameSession['players'] = {};
  for (let i = 0; i < count; i += 1) {
    players[`p${i}`] = { name: `P${i}`, wordCount: 0, score: 0, online: true };
  }
  return {
    settings: {
      durationSeconds: 600,
      uniqueBonusMode: 'auto',
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: true,
      allowSlang: true,
    },
    players,
  };
}

describe('formatLobbySettingsLabel', () => {
  it('shows bonus off for auto mode with two players', () => {
    expect(formatLobbySettingsLabel(t, sessionWithPlayers(2))).toContain('бонус x2 вимк.');
  });

  it('shows bonus on for auto mode with three players', () => {
    expect(formatLobbySettingsLabel(t, sessionWithPlayers(3))).toContain('бонус x2 увімк.');
  });
});
