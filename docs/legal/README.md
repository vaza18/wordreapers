# Legal documents

User-facing legal text is organized by **locale** (BCP 47), matching `dictionaries/{locale}/`.

| Locale             | Language / region   | Documents                                                        |
| ------------------ | ------------------- | ---------------------------------------------------------------- |
| [`uk-uk/`](uk-uk/) | Ukrainian (Ukraine) | Privacy policy, terms of use, open source notice, AI attestation |
| `en-us/`           | English (US)        | _(planned)_                                                      |

## Files per locale

Each locale folder contains:

| File                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `privacy_policy.md` | What data is collected and user rights                     |
| `terms_of_use.md`   | Service terms, disclaimers, liability                      |
| `open_source.md`    | Code license (MIT), third-party attributions               |
| `ai_attestation.md` | AI tools used in development, verification, responsibility |

The **MIT License** for source code stays at the repository root: [`LICENSE`](../../LICENSE).

## App integration (future)

The in-app “Legal” screen should load documents for the active locale, e.g. `docs/legal/uk-uk/privacy_policy.md`, with fallback to a default locale if a translation is missing.
