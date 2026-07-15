# Agent session notes (rolling)

Short-lived observations from AI agent sessions — flaky tests, emulator quirks, temporary workarounds. **Not** the source of truth.

Promote important items to permanent docs (`known-issues.md`, `online-multiplayer-rules.md`, `decisions.md`) and delete stale notes here.

---

<!-- Add dated notes at the top -->

### 2026-07-15 — Rematch starter solo UI after invite joins

- Room `6DGFA` rematch: `uniqueBonusEnabled: false` in RTDB with 3 `liveRoundPlayerUids` — latch update aborted by full `players` rewrite. Starter alone at round start kept solo UI. Fix: leaf score patches + hasMultiplayerRound online-peer fallback.

### 2026-07-15 — Revert iOS input-lag “optimizations”

- User: hangs mid-word without toasts (e.g. «ЛЕЛЕ» last letter delayed seconds). Confirmed not toast-root. Pre-change iOS was fine; Android 100+ training was the original bug.
- Action: reverted compose island / contention store / deferred+transition experiments on play path. Kept `buildSoloWordListDisplay` memo + WordList Fabric row slots.
- Follow-up: «КОЛООН» + «Недоступні літери» — base word has only 2×О; extra О from lag/double-press before used-keys re-render. Debounce word-list `draftPrefix`; sync `draftKeyIndicesRef` on press.
- Lesson: on RN/iOS do not put `useDeferredValue` / `startTransition` beside draft; speculative isolation can regress more than it helps.

### 2026-07-15 — Release CI: `Could not find command "_2.6.9_"`

- After `vendor/bin` on PATH, a shell `bundle(){ bundle _2.6.9_ "$@"; }` hit a vendored `bundle` stub → `_2.6.9_` treated as a subcommand. Fix: absolute Bundler binary + invoke `fastlane` from PATH (not `bundle exec`).
- Also: bundletool download progress must go to stderr or it pollutes Play `--version_name`.

### 2026-07-15 — Release CI: iOS `spawn fastlane ENOENT`

- Local `eas build --platform ios` needs `fastlane` on PATH during the native build, not only for TestFlight upload. Install + binstubs via `ensure-fastlane.sh` before `eas build`.

### 2026-07-15 — Release CI: AAB overwritten + Bundler 1.x

- Local EAS `--output wordreapers.aab` + `buildArtifactPaths: mapping.txt` rewrote the AAB as ASCII mapping (~71MB `file: ASCII text`). Drop `buildArtifactPaths` from production when CI uses a single-file `--output`.
- `Gemfile.lock` `BUNDLED WITH 1.17.2` made Bundler 4 install 1.17.2 → `undefined method untaint` on Ruby 3.3. Lock to Bundler 2.6.9 + `ruby/setup-ruby` in the workflow.

### 2026-07-14 — Submit latency: parallel wordSet + single increment

- Shipped ADR-013. Profiler marks: `shardParentGet`, `sessionGet`, `sessionIncrement` / `sessionDualTx`, `wordSet` (may interleave).
- Remaining 5+ same-word race (two first-finders both +2) is unchanged — needs parent `wordPlayers/{word}` transaction or CF later; do **not** use increment for demotion.
