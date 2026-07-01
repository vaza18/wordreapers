/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- Metro asset modules */
/** Bundled gzip dictionary assets for runtime extract (see dictionary-disk-cache). */
export const BUNDLED_DICTIONARY_GZ_MODULES = {
  dictionary: require('../../assets/generated/dictionaries/uk-uk/dictionary.txt.gz'),
  baseWords: require('../../assets/generated/dictionaries/uk-uk/base_words.txt.gz'),
  supplementProperNouns: require('../../assets/generated/dictionaries/uk-uk/supplement_proper_nouns.txt.gz'),
  supplementSlang: require('../../assets/generated/dictionaries/uk-uk/supplement_slang.txt.gz'),
} as const;
