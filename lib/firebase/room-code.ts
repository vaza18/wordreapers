/** Letters/digits without 0/O, 1/I/l confusion (mockup: 7 X 3 K). */
const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const DEFAULT_CODE_LENGTH = 4;

/**
 * Generate a random room code (uppercase).
 */
export function generateRoomCode(length = DEFAULT_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index] ?? 'X';
  }
  return code;
}

/**
 * Normalize user input: uppercase, strip spaces, map lookalikes.
 */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s/g, '')
    .split('')
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, 6);
}

/**
 * Return true when code looks like a valid room id.
 */
export function isValidRoomCode(code: string): boolean {
  return /^[2-9A-Z]{4,6}$/.test(code) && !code.includes('O') && !code.includes('I');
}
