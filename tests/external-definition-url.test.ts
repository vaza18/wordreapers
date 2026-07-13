import { describe, expect, it } from 'vitest';

import {
  GOROH_DEFINITION_PATH,
  GOROH_ORIGIN,
  buildUkrainianDefinitionUrl,
} from '@/lib/dictionary/external-definition-url';

describe('buildUkrainianDefinitionUrl', () => {
  it('builds a goroh definition URL with encoded Cyrillic word', () => {
    const url = buildUkrainianDefinitionUrl('книга');
    expect(url).toBe(
      `${GOROH_ORIGIN}/${encodeURIComponent(GOROH_DEFINITION_PATH)}/${encodeURIComponent('книга')}`,
    );
    expect(url).toContain(encodeURIComponent('книга'));
    expect(url?.startsWith(`${GOROH_ORIGIN}/`)).toBe(true);
  });

  it('trims surrounding whitespace before encoding', () => {
    expect(buildUkrainianDefinitionUrl('  слово  ')).toBe(buildUkrainianDefinitionUrl('слово'));
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(buildUkrainianDefinitionUrl('')).toBeNull();
    expect(buildUkrainianDefinitionUrl('   ')).toBeNull();
    expect(buildUkrainianDefinitionUrl('\t\n')).toBeNull();
  });

  it('encodes apostrophes and special characters in the path segment', () => {
    const url = buildUkrainianDefinitionUrl("м'яч");
    expect(url).toBe(
      `${GOROH_ORIGIN}/${encodeURIComponent(GOROH_DEFINITION_PATH)}/${encodeURIComponent("м'яч")}`,
    );
  });
});
