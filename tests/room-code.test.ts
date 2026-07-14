import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../lib/firebase/room-code.js';

describe('room-code', () => {
  it('generates 5-char codes from safe alphabet by default', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(DEFAULT_CODE_LENGTH);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('rejects codes that are not exactly 5 characters', () => {
    expect(isValidRoomCode(generateRoomCode(4))).toBe(false);
    expect(isValidRoomCode('ABCDE F')).toBe(false);
    expect(isValidRoomCode('AB')).toBe(false);
  });

  it('normalizes user input to at most 5 chars', () => {
    expect(normalizeRoomCode('7 x3k9')).toBe('7X3K9');
    expect(normalizeRoomCode('ABCDEF')).toBe('ABCDE');
  });

  it('rejects too short codes', () => {
    expect(isValidRoomCode('AB')).toBe(false);
  });
});
