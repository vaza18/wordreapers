import { describe, expect, it } from 'vitest';

import { getAvatarInitials } from '@/lib/profile/avatar-initials';

describe('getAvatarInitials', () => {
  it('uses first character for a single word', () => {
    expect(getAvatarInitials('Василь')).toBe('В');
  });

  it('uses first characters from the first two words', () => {
    expect(getAvatarInitials('Василь Зайцев')).toBe('ВЗ');
    expect(getAvatarInitials('Юлія Олександрівна Зайцева')).toBe('ЮО');
  });

  it('preserves the second character case and digits', () => {
    expect(getAvatarInitials('Василь 2')).toBe('В2');
    expect(getAvatarInitials('Василь iPhone')).toBe('Вi');
  });

  it('handles extra whitespace', () => {
    expect(getAvatarInitials('  Василь   Зайцев  ')).toBe('ВЗ');
  });

  it('returns a placeholder for empty names', () => {
    expect(getAvatarInitials('')).toBe('?');
    expect(getAvatarInitials('   ')).toBe('?');
    expect(getAvatarInitials(undefined)).toBe('?');
  });
});
