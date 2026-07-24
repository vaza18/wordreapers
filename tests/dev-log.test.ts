import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  devLog,
  devLogAction,
  formatDevLogLine,
  formatDevLogTimestamp,
  formatRoomRoundSuffix,
  getDevLogLevel,
  isDevLogEnabled,
  parseDevLogLevel,
  resolveLocalActorLabel,
} from '../lib/debug/dev-log.js';

describe('dev-log', () => {
  const originalEnv = process.env.EXPO_PUBLIC_LOG_LEVEL;

  beforeEach(() => {
    vi.stubGlobal('__DEV__', true);
    delete process.env.EXPO_PUBLIC_LOG_LEVEL;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_LOG_LEVEL;
    } else {
      process.env.EXPO_PUBLIC_LOG_LEVEL = originalEnv;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses valid levels case-insensitively', () => {
    expect(parseDevLogLevel('EVENT')).toBe('event');
    expect(parseDevLogLevel(' all ')).toBe('all');
    expect(parseDevLogLevel('nope')).toBeNull();
    expect(parseDevLogLevel(undefined)).toBeNull();
  });

  it('returns none outside __DEV__ regardless of env', () => {
    vi.stubGlobal('__DEV__', false);
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'all';
    expect(getDevLogLevel()).toBe('none');
    expect(isDevLogEnabled('error')).toBe(false);
  });

  it('defaults to event in __DEV__ when env is empty or invalid', () => {
    expect(getDevLogLevel()).toBe('event');
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'bogus';
    expect(getDevLogLevel()).toBe('event');
  });

  it('respects EXPO_PUBLIC_LOG_LEVEL in __DEV__', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'detail';
    expect(getDevLogLevel()).toBe('detail');
    expect(isDevLogEnabled('event')).toBe(true);
    expect(isDevLogEnabled('all')).toBe(false);
  });

  it('formats local timestamps with milliseconds', () => {
    const date = new Date(2026, 7, 23, 20, 40, 3, 340);
    expect(formatDevLogTimestamp(date)).toBe('2026-08-23 20:40:03.340');
  });

  it('formats room/round suffix', () => {
    expect(formatRoomRoundSuffix('L8NN5', 0)).toBe(' (L8NN5, round 0)');
    expect(formatRoomRoundSuffix('L8NN5')).toBe(' (L8NN5)');
    expect(formatRoomRoundSuffix(null, 2)).toBe(' (round 2)');
    expect(formatRoomRoundSuffix()).toBe('');
  });

  it('formats a full log line', () => {
    const date = new Date(2026, 7, 23, 20, 40, 3, 340);
    expect(formatDevLogLine('Василь 3', 'created room L8NN5', date)).toBe(
      '[2026-08-23 20:40:03.340] [Василь 3] created room L8NN5',
    );
  });

  it('resolveLocalActorLabel prefers explicit actor', () => {
    expect(resolveLocalActorLabel('  Host  ')).toBe('Host');
  });

  it('devLog is silent when level is too low', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'none';
    devLog('event', 'should not appear');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('devLog emits console.warn for error level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'error';
    devLog('error', 'boom', 'Tester');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[Tester] boom'));
    expect(console.log).not.toHaveBeenCalled();
  });

  it('devLogAction emits local events at event level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'event';
    devLogAction('created room', { actor: 'Василь 3', room: 'L8NN5', round: 0 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[Василь 3\] created room \(L8NN5, round 0\)/,
      ),
    );
  });

  it('suppresses observed remote actions at event level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'event';
    devLogAction('joined room', { actor: 'Peer', room: 'L8NN5', observed: true });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('emits observed remote actions at detail level', () => {
    process.env.EXPO_PUBLIC_LOG_LEVEL = 'detail';
    devLogAction('joined room', {
      actor: 'Peer',
      room: 'L8NN5',
      round: 0,
      observed: true,
      details: 'via code',
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[Peer] joined room via code (observed) (L8NN5, round 0)'),
    );
  });
});
