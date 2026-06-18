/**
 * Display room code with spacing (mockup: `7 X 3 K`).
 */
export function formatRoomCodeDisplay(code: string): string {
  return code.toUpperCase().replace(/\s/g, '').split('').join(' ');
}
