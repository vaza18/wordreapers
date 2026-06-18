/** Parsed headword line from VESUM `dict_corp_vis.txt`. */
export interface VesumLine {
  word: string;
  tags: string;
}

/**
 * Parse one line of dict_corp_vis.txt (indented visual format).
 */
export function parseVesumLine(raw: string): VesumLine | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const withoutComment = trimmed.split('#')[0]?.trim() ?? '';
  if (!withoutComment) {
    return null;
  }

  const spaceIdx = withoutComment.indexOf(' ');
  if (spaceIdx === -1) {
    return null;
  }

  const word = withoutComment.slice(0, spaceIdx).trim();
  const tags = withoutComment.slice(spaceIdx + 1).trim();
  if (!word || !tags) {
    return null;
  }

  return { word, tags };
}

/** Return whether VESUM tags mark a proper noun (`:prop`). */
export function isProperNoun(tags: string): boolean {
  return tags.includes(':prop');
}

/** Return whether VESUM tags mark an abbreviation (`:abbr`). */
export function isAbbreviation(tags: string): boolean {
  return tags.includes(':abbr');
}

/** Return whether VESUM tags mark a pronoun (`:pron:`). */
export function isPronoun(tags: string): boolean {
  return tags.includes(':pron:');
}

/** Return whether VESUM tags mark slang (`:slang`). */
export function isSlang(tags: string): boolean {
  return tags.includes(':slang');
}

/** Return whether VESUM tags mark archaic / outdated vocabulary (`:arch`). */
export function isArchaic(tags: string): boolean {
  return tags.includes(':arch');
}

/** Return whether VESUM tags mark substandard forms (`:subst`). */
export function isSubstandard(tags: string): boolean {
  return tags.includes(':subst');
}

/** Return whether VESUM tags mark erroneous or objectionable lemmas (`:bad`). */
export function isBadLemma(tags: string): boolean {
  return tags.includes(':bad');
}

/** Return whether VESUM tags mark vulgar vocabulary (`:vulg`). */
export function isVulgar(tags: string): boolean {
  return tags.includes(':vulg');
}

/** Return whether VESUM tags mark obscene vocabulary (`:obsc`). */
export function isObscene(tags: string): boolean {
  return tags.includes(':obsc');
}

/**
 * Stylistic tags that mark non-standard modern Ukrainian for the main game dictionary.
 * VESUM has no dedicated surzhyk tag; `:arch` / `:bad` / `:subst` are the closest signals.
 * Profanity: `:vulg` (грубі слова) and `:obsc` (обсценна лексика, напр. «хуїльйон»).
 */
export function isExcludedStylistic(tags: string): boolean {
  return (
    isArchaic(tags) || isSubstandard(tags) || isBadLemma(tags) || isVulgar(tags) || isObscene(tags)
  );
}

/**
 * Nominative singular adjective (any gender).
 */
export function isAdjectiveNominativeSingular(tags: string): boolean {
  return tags.startsWith('adj:') && tags.includes(':v_naz') && !tags.includes(':p:v_naz');
}

/**
 * Gradable adjective lemma — often homographs with rare substantivized noun senses.
 */
export function isGradableAdjectiveLemma(tags: string): boolean {
  return isAdjectiveNominativeSingular(tags) && tags.includes(':compb');
}

/**
 * Nominative singular noun (Condition A in TZ §7.4).
 */
export function isNounNominativeSingular(tags: string): boolean {
  if (!tags.startsWith('noun:')) {
    return false;
  }
  if (!tags.includes(':v_naz')) {
    return false;
  }
  if (tags.includes(':p:v_naz')) {
    return false;
  }
  return true;
}

/**
 * Pluralia tantum: nominative plural with :ns marker (Condition B).
 */
export function isNounPluraliaTantumNominative(tags: string): boolean {
  if (!tags.startsWith('noun:')) {
    return false;
  }
  return tags.includes(':p:v_naz') && tags.includes(':ns');
}

/** Return whether tags describe an acceptable noun dictionary form. */
export function isNounDictionaryForm(tags: string): boolean {
  if (isAbbreviation(tags)) {
    return false;
  }
  return isNounNominativeSingular(tags) || isNounPluraliaTantumNominative(tags);
}

/** Return whether tags qualify for the main in-game dictionary. */
export function isGameDictionaryEntry(tags: string): boolean {
  if (isProperNoun(tags) || isAbbreviation(tags) || isPronoun(tags)) {
    return false;
  }
  return isNounDictionaryForm(tags);
}

/** Return whether tags belong in `supplement_proper_nouns.txt`. */
export function isSupplementProperNounEntry(tags: string): boolean {
  return isProperNoun(tags) && isNounDictionaryForm(tags);
}

/** Return whether VESUM tags mark a geographical proper noun (`:geo` topnym). */
export function isGeographicalProperNoun(tags: string): boolean {
  return tags.includes(':geo');
}

/** Return whether tags qualify for `base_words.txt` proper-noun pool (geo only). */
export function isBaseWordGeographicalEntry(tags: string): boolean {
  return isSupplementProperNounEntry(tags) && isGeographicalProperNoun(tags);
}

/** Return whether tags belong in `supplement_slang.txt`. */
export function isSupplementSlangEntry(tags: string): boolean {
  return isSlang(tags) && isGameDictionaryEntry(tags) && !isExcludedStylistic(tags);
}

/**
 * Return whether a VESUM entry belongs in the main `dictionary.txt`.
 */
export function isMainDictionaryEntry(
  tags: string,
  normalizedWord: string,
  gradableAdjectiveHomographs: ReadonlySet<string>,
): boolean {
  if (!isGameDictionaryEntry(tags)) {
    return false;
  }
  if (isSlang(tags) || isExcludedStylistic(tags)) {
    return false;
  }
  if (gradableAdjectiveHomographs.has(normalizedWord)) {
    return false;
  }
  return true;
}

/** Return whether tags belong in any supplement list. */
export function isSupplementDictionaryEntry(tags: string): boolean {
  return isSupplementProperNounEntry(tags) || isSupplementSlangEntry(tags);
}
