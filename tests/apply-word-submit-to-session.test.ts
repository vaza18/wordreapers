import { describe, expect, it } from 'vitest';

import {
  applyPlayerScoreFromWordSubmit,
  applyPlayerScorePlan,
  applyWordSubmitToSession,
  applyWordSubmitToWordMaps,
  applyWordSubmitToWordPlayersShard,
  buildPartialWordMaps,
  planPlayerScoreUpdate,
} from '../lib/online/apply-word-submit-to-session.js';
import type { GameSession, SessionWordMaps } from '../lib/firebase/types.js';

function playingSession(overrides?: Partial<GameSession>): GameSession {
  return {
    timerEndsAt: Date.now() + 600_000,
    organizerId: 'org',
    status: 'playing',
    baseWord: 'кропивницька',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: true,
      uniqueBonusMode: 'auto',
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    players: {
      p1: { name: 'A', score: 0, wordCount: 0, avatarColorIndex: 0, online: true },
      p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
    },
    wordFirst: {},
    wordPlayers: {},
    ...overrides,
  };
}

describe('applyWordSubmitToWordPlayersShard', () => {
  it('scores first unique word with x2 when bonus is on', () => {
    const result = applyWordSubmitToWordPlayersShard(null, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.prevGlobal).toBe(0);
    expect(result.entry.points).toBe(2);
    expect(result.maps.wordPlayers?.порт?.p1).toBe(true);
  });

  it('rejects duplicate submission from same player', () => {
    const result = applyWordSubmitToWordPlayersShard({ p1: true }, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('marks overlap on second player', () => {
    const first = applyWordSubmitToWordPlayersShard(null, 'p1', 'порт', true);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = applyWordSubmitToWordPlayersShard(
      first.maps.wordPlayers?.порт ?? null,
      'p2',
      'порт',
      true,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.prevGlobal).toBe(1);
    expect(second.entry.points).toBe(1);
    expect(second.entry.kind).toBe('normal');
  });
});

describe('buildPartialWordMaps', () => {
  it('includes first uid only when provided', () => {
    expect(buildPartialWordMaps('порт', { p1: true }, 'p1').wordFirst).toEqual({ порт: 'p1' });
    expect(buildPartialWordMaps('порт', { p1: true, p2: true }).wordFirst).toEqual({});
  });
});

describe('planPlayerScoreUpdate', () => {
  it('uses single-player plan for first unique word', () => {
    const session = playingSession();
    const maps = buildPartialWordMaps('порт', { p1: true }, 'p1');
    const shard = applyWordSubmitToWordPlayersShard(null, 'p1', 'порт', true);
    if (!shard.ok) {
      throw new Error('expected shard ok');
    }
    const planned = planPlayerScoreUpdate(session, maps, 'p1', 'порт', shard.entry, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    expect(planned.plan.mode).toBe('single');
    if (planned.plan.mode !== 'single') {
      return;
    }
    expect(planned.plan.nextScore).toBe(2);
    expect(planned.plan.nextWordCount).toBe(1);
  });

  it('uses dual-player plan when x2 demotion applies', () => {
    const session = playingSession({
      players: {
        p1: { name: 'A', score: 2, wordCount: 1, avatarColorIndex: 0, online: true },
        p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
      },
    });
    const maps = buildPartialWordMaps('порт', { p1: true, p2: true }, 'p1');
    const entry = { normalized: 'порт', kind: 'normal' as const, points: 1, badge: null };
    const planned = planPlayerScoreUpdate(session, maps, 'p2', 'порт', entry, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    expect(planned.plan.mode).toBe('dual');
    if (planned.plan.mode !== 'dual') {
      return;
    }
    expect(planned.plan.firstNextScore).toBe(1);
    expect(planned.plan.nextScore).toBe(1);
    expect(planned.plan.nextWordCount).toBe(1);
  });

  it('uses map word count when session player totals lag behind maps', () => {
    const session = playingSession({
      players: {
        p1: { name: 'A', score: 10, wordCount: 5, avatarColorIndex: 0, online: true },
      },
    });
    const wordPlayers: SessionWordMaps['wordPlayers'] = {
      а: { p1: true },
      б: { p1: true },
      в: { p1: true },
      г: { p1: true },
      д: { p1: true },
      е: { p1: true },
    };
    const maps: SessionWordMaps = { wordFirst: {}, wordPlayers };
    const entry = { normalized: 'е', kind: 'unique' as const, points: 2, badge: 'x2' as const };
    const planned = planPlayerScoreUpdate(session, maps, 'p1', 'е', entry, true);
    expect(planned.ok).toBe(true);
    if (!planned.ok || planned.plan.mode !== 'single') {
      return;
    }
    expect(planned.plan.nextWordCount).toBe(6);
    expect(planned.plan.nextScore).toBe(12);
  });
});

describe('applyPlayerScorePlan', () => {
  it('applies dual-player demotion and increment', () => {
    const session = playingSession({
      players: {
        p1: { name: 'A', score: 2, wordCount: 1, avatarColorIndex: 0, online: true },
        p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
      },
    });
    const next = applyPlayerScorePlan(session.players, {
      mode: 'dual',
      firstUid: 'p1',
      firstNextScore: 1,
      uid: 'p2',
      nextScore: 1,
      nextWordCount: 1,
    });
    expect(next.p1?.score).toBe(1);
    expect(next.p2?.score).toBe(1);
    expect(next.p2?.wordCount).toBe(1);
    expect(next.p2?.hasLeft).toBe(false);
  });
});

describe('applyWordSubmitToSession', () => {
  it('scores first unique word with x2 when bonus is on', () => {
    const session = playingSession();
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entry.points).toBe(2);
    expect(result.entry.badge).toBe('x2');
    expect(result.session.players.p1?.score).toBe(2);
    expect(result.session.players.p1?.wordCount).toBe(1);
    expect(result.session.wordPlayers?.порт?.p1).toBe(true);
  });

  it('rejects duplicate submission from same player', () => {
    const session = playingSession({
      wordFirst: { порт: 'p1' },
      wordPlayers: { порт: { p1: true } },
      players: {
        p1: { name: 'A', score: 2, wordCount: 1, avatarColorIndex: 0, online: true },
        p2: { name: 'B', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
      },
    });
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
  });

  it('rejects when session is not playing', () => {
    const session = playingSession({ status: 'finished' });
    const result = applyWordSubmitToSession(session, 'p1', 'порт', true);
    expect(result).toEqual({ ok: false, error: 'NOT_PLAYING' });
  });
});

describe('applyWordSubmitToWordMaps', () => {
  it('returns prevGlobal for legacy full-tree helper', () => {
    const result = applyWordSubmitToWordMaps({}, 'p1', 'порт', true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.prevGlobal).toBe(0);
  });
});

describe('applyPlayerScoreFromWordSubmit', () => {
  it('delegates to plan + apply', () => {
    const session = playingSession();
    const maps = buildPartialWordMaps('порт', { p1: true }, 'p1');
    const entry = { normalized: 'порт', kind: 'unique' as const, points: 2, badge: 'x2' as const };
    const result = applyPlayerScoreFromWordSubmit(session, maps, 'p1', 'порт', entry, true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.session.players.p1?.score).toBe(2);
  });
});
