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

| Path                                | Purpose                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uk-uk/dictionary.txt`              | Sorted normalized words (no apostrophes)                                                                                                                    |
| `uk-uk/base_words.txt`              | Autocomplete / ↺: one normalized word per line (main dictionary + geographical proper nouns `:geo` ≥8). Display via `displayForm(word, normalization.json)` |
| `uk-uk/meta.json`                   | VESUM version, counts, build timestamp                                                                                                                      |
| `uk-uk/normalization.json`          | `normalized → canonical` **only where forms differ** (≈1700 apostrophe entries)                                                                             |
| `uk-uk/supplement_proper_nouns.txt` | Optional lookup when `allowProperNouns` is enabled (~58k)                                                                                                   |
| `uk-uk/supplement_slang.txt`        | Optional lookup when `allowSlang` is enabled (~1.8k)                                                                                                        |

**Runtime lookup (Tier 1):** main dictionary always; supplements only when the matching round option is on (both default **off**).

**Main dictionary filters** (see `lib/dictionary/vesum-tags.ts`):

- nouns, nominative, singular (+ pluralia tantum `:ns`)
- exclude `:prop`, `:abbr`, `:pron:` (займенники), `:slang`
- exclude stylistic non-standard tags: `:arch`, `:subst`, `:bad`, `:vulg`, `:obsc` (VESUM has no surzhyk tag; `:obsc` = obscene, e.g. «хуїльйон»; `:arch` drops e.g. «утка», standard «качка» stays)
- exclude **gradable adjective homographs** (`adj` with `:v_naz` + `:compb` — e.g. `чорний` as color adjective, not rare noun sense)
- manual blocklist: `scripts/dictionary/blocklist-uk-uk.txt`

Future example: `en-us/` with the same four files for English (US).

Paths are defined in `lib/dictionary/paths.ts`.

## Source (`.data/vesum/` — not committed)

Downloaded from [brown-uk/dict_uk releases](https://github.com/brown-uk/dict_uk/releases): `dict_corp_vis.txt.bz2`.

Future Expo app: hook `dict:all` into `prebuild` when the mobile project exists.
