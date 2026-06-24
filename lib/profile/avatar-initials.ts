const LOCALE = 'uk-UA';

/**
 * Derive avatar initials from a display name.
 * Single word → first character (uppercase). Two or more words → first character
 * of the first word (uppercase) plus the first character of the second word (as-is).
 */
export function getAvatarInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }

  const first = words[0].charAt(0).toLocaleUpperCase(LOCALE);
  if (words.length === 1) {
    return first || '?';
  }

  const second = words[1].charAt(0);
  const initials = `${first}${second}`;
  return initials || '?';
}
