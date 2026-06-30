# Dictionary build (VESUM → dictionaries/)

TypeScript pipeline. Raw VESUM files stay in `.data/vesum/` (gitignored).

## Commands

```bash
npm install
npm run dict:all          # fetch latest release + build dictionaries/
npm run dict:validate     # run validation_test_cases against built files
npm run dict:review-sample # docs/dictionary_review_sample.md (100 random words)
npm test                  # unit tests (tags, normalize, multiset)
npm run lint              # ESLint (lib/ exports require JSDoc)
```

## Output (`assets/generated/dictionaries/` — gitignored)

Each locale is one folder (BCP 47 tag). Example for Ukrainian:

| Path                                   | Purpose                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `uk-uk/dictionary.txt.gz`              | Sorted normalized words (gzip; plain `.txt` not kept in output)                              |
| `uk-uk/base_words.txt.gz`              | Autocomplete / ↺: normalized strings (main dictionary + geographical proper nouns `:geo` ≥8) |
| `uk-uk/meta.json`                      | VESUM version, `dictBuildId`, counts, build timestamp                                        |
| `uk-uk/normalization.json`             | `normalized → canonical` **only where forms differ** (≈1700 apostrophe entries)              |
| `uk-uk/supplement_proper_nouns.txt.gz` | Optional lookup when `allowProperNouns` is enabled                                           |
| `uk-uk/supplement_slang.txt.gz`        | Optional lookup when `allowSlang` is enabled                                                 |

**Runtime lookup (Tier 1):** main dictionary always; supplements only when the matching round option is on (both default **off**).

**Round Playable Lexicon (runtime, not in build output):** [`lib/dictionary/round-playable-lexicon.ts`](../../lib/dictionary/round-playable-lexicon.ts) filters the same dictionary files for all words playable from a base word’s letter multiset (`allowProperNouns` / `allowSlang` gates supplements). Used for lobby max hint, play-screen found/max counter, faster validation, results «show missing words», and local finished-archive snapshot (`playableLexicon`, archive v3). Cached in memory per `baseWord|proper|slang`.

**Main dictionary filters** (see `lib/dictionary/vesum-tags.ts`):

- nouns, nominative, singular (+ pluralia tantum `:ns`)
- exclude `:prop`, `:abbr`, `:pron:` (займенники), `:slang`
- exclude stylistic non-standard tags: `:arch`, `:subst`, `:bad`, `:vulg`, `:obsc` (VESUM has no surzhyk tag; `:obsc` = obscene, e.g. «хуїльйон»; `:arch` drops e.g. «утка», standard «качка» stays)
- manual blocklist: `scripts/dictionary/blocklist-uk-uk.txt` (e.g. «утка», «чорний»/«чорна» as offensive noun senses)

Future example: `en-us/` with the same four files for English (US).

Paths are defined in `lib/dictionary/paths.ts`.

## Source (`.data/vesum/` — not committed)

Downloaded from [brown-uk/dict_uk releases](https://github.com/brown-uk/dict_uk/releases): `dict_corp_vis.txt.bz2`.

Future Expo app: hook `dict:all` into `prebuild` when the mobile project exists.
