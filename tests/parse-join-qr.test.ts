import { describe, expect, it } from 'vitest';

import { parseJoinQrPayload, parseRoomCodeFromQrPayload } from '@/lib/online/parse-join-qr';

describe('parseRoomCodeFromQrPayload', () => {
  it('parses raw room code', () => {
    expect(parseRoomCodeFromQrPayload('7X3K9')).toBe('7X3K9');
  });

  it('parses code from URL query', () => {
    expect(parseRoomCodeFromQrPayload('wordreapers://online/join?code=7X3K9')).toBe('7X3K9');
    expect(parseRoomCodeFromQrPayload('https://example.com/online/join?code=ABCDE')).toBe('ABCDE');
  });

  it('rejects invalid payloads', () => {
    expect(parseRoomCodeFromQrPayload('')).toBeNull();
    expect(parseRoomCodeFromQrPayload('not-a-code')).toBeNull();
    expect(parseRoomCodeFromQrPayload('7X3K')).toBeNull();
  });
});

describe('parseJoinQrPayload', () => {
  it('parses invitedBy from join URL', () => {
    expect(
      parseJoinQrPayload('wordreapers://online/join?code=7X3K9&invitedBy=uid-babusha'),
    ).toEqual({
      code: '7X3K9',
      invitedBy: 'uid-babusha',
    });
  });
});
