/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- Metro asset modules */
/** Bundled plain-text dictionary assets (see dictionary-service). */
export const BUNDLED_DICTIONARY_TEXT_MODULES = {
  dictionary: require('../../assets/generated/dictionaries/uk-uk/dictionary.txt'),
  baseWords: require('../../assets/generated/dictionaries/uk-uk/base_words.txt'),
  supplementProperNouns: require('../../assets/generated/dictionaries/uk-uk/supplement_proper_nouns.txt'),
  supplementSlang: require('../../assets/generated/dictionaries/uk-uk/supplement_slang.txt'),
  whitelistGeneral: require('../../assets/generated/dictionaries/uk-uk/whitelist_general.txt'),
  whitelistProperNouns: require('../../assets/generated/dictionaries/uk-uk/whitelist_proper_nouns.txt'),
  whitelistSlang: require('../../assets/generated/dictionaries/uk-uk/whitelist_slang.txt'),
} as const;
