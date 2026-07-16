import { describe, expect, it } from 'vitest';

import uk from '../i18n/locales/uk.json';
import { buildGameMenuGroups } from '../lib/ui/game-menu-groups.js';

describe('buildGameMenuGroups', () => {
  it('orders session → other → leave with leave actions last', () => {
    const groups = buildGameMenuGroups({
      showPause: true,
      showInvite: true,
      showEndGame: true,
      showExit: true,
      showHowToPlay: true,
    });

    expect(groups.map((g) => g.id)).toEqual(['session', 'other', 'leave']);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      ['pause', 'invite'],
      ['howToPlay'],
      ['endGame', 'exit'],
    ]);
    expect(groups.at(-1)?.id).toBe('leave');
  });

  it('omits empty groups when visibility flags hide items', () => {
    const groups = buildGameMenuGroups({
      showPause: false,
      showInvite: false,
      showEndGame: false,
      showExit: false,
      showHowToPlay: false,
    });

    expect(groups).toEqual([]);
  });

  it('uses QR-like icon for invite and has no accent continue row', () => {
    const groups = buildGameMenuGroups({
      showInvite: true,
      showPause: true,
    });
    const flat = groups.flatMap((g) => g.items);
    expect(flat.map((i) => i.id)).toEqual(['pause', 'invite']);
    expect(flat.find((i) => i.id === 'invite')?.icon).toBe('▦');
    expect(flat.some((i) => i.id === 'pause')).toBe(true);
  });
});

describe('game menu uk copy', () => {
  it('uses short labels without emoji prefixes', () => {
    expect(uk.game.menuPause).toBe('Пауза');
    expect(uk.game.menuPauseSolo).toBe('Пауза');
    expect(uk.online.menuInvitePlayer).toBe('Запросити');
    expect(uk.game.menuProposeEnd).toBe('Завершити гру');
    expect(uk.game.menuEndEarly).toBe('Завершити гру');
    expect(uk.game.menuExit).toBe('Вийти з гри');
    expect(uk.nav.settings).toBe('Налаштування');
    expect(uk.game.menuHowToPlay).toBe('Як грати');

    for (const label of [
      uk.game.menuPause,
      uk.game.menuPauseSolo,
      uk.online.menuInvitePlayer,
      uk.game.menuProposeEnd,
      uk.game.menuEndEarly,
      uk.game.menuExit,
      uk.nav.settings,
      uk.game.menuHowToPlay,
    ]) {
      expect(label).not.toMatch(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});
