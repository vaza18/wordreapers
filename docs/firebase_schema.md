# Firebase Realtime Database schema (Wordreapers)

Online multiplayer uses RTDB under the paths below. Types live in [`lib/firebase/types.ts`](../lib/firebase/types.ts).

## `game_sessions/{gameId}`

Core session document for a room.

| Field               | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `status`            | `waiting` \| `playing` \| `finished`                                  |
| `organizerId`       | Firebase uid of room creator                                          |
| `baseWord`          | Current round base word                                               |
| `settings`          | Duration, lexicon flags, `language` (e.g. `uk-uk`)                    |
| `players/{uid}`     | Roster: name, scores, `online`, `hasLeft`, `publicAlias`, `joinedVia` |
| `isPublic`          | Room listed in public browse while waiting                            |
| `publicPublishedAt` | Server ms when published to browse                                    |
| `identityMasked`    | Permanent after a browse-list join; pseudonyms for strangers          |
| `maxPlayers`        | Cap for public rooms (8)                                              |

**Join (browse or invite):** clients write `players/{uid}` on `game_sessions`. `ROOM_FULL` is computed from active roster (`hasLeft !== true`), not from browse index counters.

**RTDB read policy (Phase 1 security):**

- **Roster members** — full read on `game_sessions/{gameId}` for any `status`.
- **Non-members** — read only when `status === 'waiting'` (browse / lobby peek).
- **Invite into `playing` room** — no pre-read; client uses blind join (`players/{self}` + session metadata patch), then reads as roster. RTDB `settings` are not writable while `status === 'playing'`, but clients derive `uniqueBonusEnabled` from `uniqueBonusMode` + **current** roster size (mid-round join to 3+ turns on auto x2 in UI and score sync).

`players/{uid}.joinedVia`:

- `browse` — joined from public matchmaking list
- `invite` — room code / QR

## `public_lobbies/{language}/{gameId}`

Denormalized **browse index** (one row per public waiting room).

| Field                       | Description                                 |
| --------------------------- | ------------------------------------------- |
| `baseWord` / `baseWordNorm` | Display + sort key (normalized Ukrainian)   |
| `playerCount`               | Active roster size (mirror of session)      |
| `maxPlayers`                | Always 8 for public rooms                   |
| `publishedAt`               | Sort key (newest first)                     |
| `expiresAt`                 | `publishedAt + PUBLIC_LOBBY_TTL_MS` (5 min) |

**Who writes:**

- **Organizer** — create full index row on publish (`set`); session must have `isPublic === true`
- **Any roster player** — update `playerCount` only after join/leave (other index fields unchanged)
- **Organizer or roster player** — delete row on unpublish (`remove`)

**Cloud Function `guardPublicLobbyWrite`** validates every write against `base_words.uk-uk.txt` allowlist and requires `baseWordNorm === normalizeUk(baseWord)`; rejects invalid rows.

TTL display in the app uses Firebase server clock (`getServerNow` / `useServerNow`).

## `public_lobby_counts/{language}`

Single number: **how many public waiting rooms** exist for a language (not player count).

- **Clients:** read-only (RTDB rule `.write: false`)
- **Maintained by Cloud Functions:**
  - `guardPublicLobbyWrite` — `+1` on new valid index row, `-1` on delete or invalid→removed
  - `purgeStalePublicLobbiesScheduled` — removes stale rows and **reconciles** count from live shard scan every 15 minutes

Browse pagination reads this node for `total` / page count; falls back to a full shard scan if the counter is missing or corrupt.

## Browse → join flow

```mermaid
sequenceDiagram
  participant User
  participant BrowseUI
  participant Index as public_lobbies
  participant Session as game_sessions
  participant CF as CloudFunctions

  User->>BrowseUI: Open browse list
  BrowseUI->>Index: fetchPublicLobbyPage
  BrowseUI->>BrowseUI: read public_lobby_counts for total

  User->>BrowseUI: Tap room
  BrowseUI->>Session: joinGameSession joinSource browse
  Note over Session: Check ROOM_FULL from players
  BrowseUI->>Index: syncPublicLobbyPlayerCount
  CF->>Index: guardPublicLobbyWrite validate
  CF->>CF: adjust public_lobby_counts if publish/unpublish
```

## Related paths

- `session_word_maps/{gameId}` — shared word overlap maps during play
  - Writes are **per-word shards** only: `wordPlayers/{normalized}/{uid}` and `wordFirst/{normalized}` (no bulk root JSON from clients).
- `player_words/{gameId}/{uid}` — per-player submitted words (immutable per normalized key)

## Security (RTDB rules + App Check)

- Rules: [`firebase/database.rules.json`](../firebase/database.rules.json) — roster-scoped writes, score caps, status transitions, waiting-only peek for strangers. **Rematch** (`finished` → `waiting`): any roster member may commit the reset transaction (clears scores, reopens lobby); rules allow roster-wide player reset only in that transition.
- **App Check:** native via `@react-native-firebase/app-check` ([`lib/firebase/app-check.ts`](../lib/firebase/app-check.ts)). **Production** release builds (`APP_VARIANT=production`): Play Integrity (Android) + App Attest (iOS). **Dev / Metro:** debug provider + `EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN` (register in Console on Android + iOS apps). Config files at repo root: `google-services.json`, `GoogleService-Info.plist` (gitignored). Enable RTDB enforcement in Console only after TestFlight / Play closed testing validates tokens.
- **Room codes:** new rooms default to **5 characters** (`lib/firebase/room-code.ts`); existing 4–6 codes remain valid.
- **Rules tests:** `npm run test:rules` (Firebase emulator + Vitest).

## Cloud Functions (RTDB)

| Function                            | Schedule / trigger                            | Role                                                     |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `guardPublicLobbyWrite`             | on write `public_lobbies/{language}/{gameId}` | Content safety + counter delta                           |
| `purgeStalePublicLobbiesScheduled`  | every 15 minutes                              | Drop expired/stale index rows; reconcile counts          |
| `purgeExpiredRtdbSessionsScheduled` | every 24 hours                                | Purge old finished sessions (`purgeAfterAt` index query) |

Deploy order when changing backend: **functions first** (indexes), then **database rules**, then **client**. App Check enforcement in Console **after** release builds include the SDK.
