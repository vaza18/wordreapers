import { describe, expect, it } from 'vitest';

import { formatUkPlayers, formatUkWords, ukPluralForm, ukWordForm } from '@/lib/i18n/uk-plural';

describe('ukPluralForm', () => {
  it('uses one for …1 except teens and penultimate 1', () => {
    expect(ukPluralForm(1)).toBe('one');
    expect(ukPluralForm(21)).toBe('one');
    expect(ukPluralForm(101)).toBe('one');
    expect(ukPluralForm(11)).toBe('many');
    expect(ukPluralForm(111)).toBe('many');
    expect(ukPluralForm(1011)).toBe('many');
  });

  it('uses few for …2–4 except teens', () => {
    expect(ukPluralForm(2)).toBe('few');
    expect(ukPluralForm(3)).toBe('few');
    expect(ukPluralForm(4)).toBe('few');
    expect(ukPluralForm(22)).toBe('few');
    expect(ukPluralForm(24)).toBe('few');
    expect(ukPluralForm(12)).toBe('many');
    expect(ukPluralForm(14)).toBe('many');
  });

  it('uses many otherwise', () => {
    expect(ukPluralForm(0)).toBe('many');
    expect(ukPluralForm(5)).toBe('many');
    expect(ukPluralForm(20)).toBe('many');
  });
});

describe('formatUkPlayers', () => {
  it('formats player counts', () => {
    expect(formatUkPlayers(1)).toBe('1 гравець');
    expect(formatUkPlayers(2)).toBe('2 гравці');
    expect(formatUkPlayers(5)).toBe('5 гравців');
    expect(formatUkPlayers(11)).toBe('11 гравців');
    expect(formatUkPlayers(21)).toBe('21 гравець');
    expect(formatUkPlayers(22)).toBe('22 гравці');
  });
});

describe('formatUkWords', () => {
  it('formats word counts', () => {
    expect(formatUkWords(1)).toBe('1 слово');
    expect(formatUkWords(2)).toBe('2 слова');
    expect(formatUkWords(5)).toBe('5 слів');
  });
});

describe('ukWordForm', () => {
  it('returns noun form without count', () => {
    expect(ukWordForm(1)).toBe('слово');
    expect(ukWordForm(8)).toBe('слів');
    expect(ukWordForm(141)).toBe('слово');
  });
});
