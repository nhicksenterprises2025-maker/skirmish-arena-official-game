# Persistent account server

LIVE CIRCUIT 1.6.0 ships the account API and SQLite database implementation. The desktop launcher includes and automatically starts the required local runtime; the commands below are for browser development or server administration. Internet cloud access requires deployment at a stable HTTPS origin with a persistent database volume. The release does not contain a hosted account service. Local Messages use the independently installed Ollama gpt-oss:20b; no inference credentials are needed.

The browser game and Tauri launcher use the same game/API origin. A username belongs to one persistent account universe: the 50 active bots, retained retired records, player career, seasons, patch archives, settings and messages. SQLite is the canonical persisted copy. Normal browser combat runs in the client; official bot tournament games run the existing isolated simulation on the server. This is not a multiplayer or anti-cheat authority service.

## Start locally

Use Node **24.15 or later in the Node 24 series**, then run from the release directory:

```powershell
npm ci --omit=dev
$env:SAR_DB_PATH = 'C:/SkirmishData/skirmish.sqlite'
$env:SAR_HOST = '127.0.0.1'
$env:SAR_PORT = '8803'
npm start
```

Open `http://127.0.0.1:8803/`. A first account needs only a username and password. Signup logs the account in automatically and shows its recovery code once. An existing local world can be imported into an empty account. The untouched local input is backed up in `world_backups` before migration, and the client retains its local backup.

The default database path is `server/data/skirmish.sqlite`. For actual deployments, set `SAR_DB_PATH` to a persistent location **outside the versioned release directory**. Keep the same path when updating server files. Do not replace the database with a fresh file to install a game update.

## Environment variables

| Variable | Default / purpose |
| --- | --- |
| `SAR_HOST` | `127.0.0.1`; listen address. Keep loopback when using a local reverse proxy. |
| `SAR_PORT` | `8803`; HTTP listen port. |
| `SAR_DB_PATH` | `server/data/skirmish.sqlite`; durable SQLite path. |
| `SAR_PUBLIC_ORIGIN` | Inferred request origin; production should set the exact stable origin, such as `https://game.example.com`, without a trailing slash. |
| `SAR_TRUST_PROXY` | Unset; set `1` only when the Node service is reachable exclusively through your trusted proxy. Enables trusted forwarded HTTPS/IP headers. |
| `SAR_OLLAMA_URL` | `http://127.0.0.1:11434`; only local loopback Ollama hosts are allowed. |
| `SAR_OLLAMA_TIMEOUT_MS` | `120000`; maximum time for each local model request. |
| `SAR_GPT_OSS_URL` | Unset; legacy explicitly configured OpenAI-compatible GPT-OSS-20B chat-completions endpoint, including its full path. HTTPS is required except for localhost development. |
| `SAR_GPT_OSS_API_KEY` | Unset; optional inference endpoint credential, used only by the server. |
| `SAR_GPT_OSS_MODEL` | `gpt-oss-20b`; deployed model identifier. |
| `SAR_ADMIN_TOKEN` | Unset; administrative tournament creation is disabled until a token is configured. It is checked against `X-SAR-Admin-Token` and never sent to client JavaScript. |

Serve public traffic through HTTPS. Configure the reverse proxy to preserve the public `Host`, set trusted forwarded headers, and prevent direct public access to the internal Node port. Static files and API requests are served by the same process; no cross-origin credential setup is needed. Write requests require JSON and reject foreign origins/cross-site browser requests.

Passwords and recovery codes use bcrypt at cost 12. The database stores salted hashes, not plaintext. Sessions use random tokens: only their SHA-256 hashes are stored. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. A session lasts 30 days; logout revokes that session. Recovery rotates the recovery code and revokes all earlier sessions. Keep database and environment backups private.

## Save consistency and seasons

Every stored world has an increasing revision and a server timestamp. `PUT /api/world` must name the revision it read. A stale revision returns HTTP 409 with `code: REVISION_CONFLICT`; a different invalid-save conflict uses `code: SAVE_REJECTED`. A rejected save does not change the cloud copy. These cases are deliberately distinct so the client can retain its pending checkpoint when validation fails.

The client hydrates its durable IndexedDB world/backup cache before loading gameplay. Large accepted worlds no longer depend on the small synchronous `localStorage` quota. Migration retains each legacy entry until its transaction commits; complete exports include retained durable branches. Replacement, import, logout and update checkpoints await a local commit before navigation. An unavailable durable store must preserve the prior authenticated branch and its original revision rather than presenting stale local totals as the latest cloud world. `npm run test:client` includes the quota/restart regression fixture.

The server checks fixed identities/Power/personality, nonnegative finite counters, immutable finalized seasons and patch archives, monotonic lifetime and weapon history, and career deltas against per-actor, Power-band, weapon and season measurements. Completed 5v5s must contribute ten career games and five wins/five losses, with compatible retained recent results. Original imported historical baselines are preserved; missing newer analytics remain unsampled.

The existing Meta archive/restart action remains available. It creates a new measured sample generation of the same balance fingerprint, retaining the entire previous sample as an immutable archive. Career, season and per-actor delta checks continue across that transition; restarting a sample cannot erase lifetime measurements.

The 15-day season deadline lives in the persisted database world. Bootstrap/world/profile reads advance expired seasons using server time and persist the transition. Both league and player season histories are retained. Clients cannot roll a season early or rewrite an existing deadline. The client uses server-anchored time while connected.

These checks detect inconsistent/corrupt/regressing snapshots. A modified client capable of forging all mutually consistent event records can still fabricate combat. Fully authoritative competitive statistics would require running matches on the server and accepting only server-produced results. This release preserves the existing browser simulation.

## Bot messaging

By default this release probes local Ollama /api/tags and uses gpt-oss:20b through /api/chat. See [LOCAL_AI.md](../docs/LOCAL_AI.md) for the full queue, personality, event, memory, feedback and JSONL workflow. Settings → Messaging reports connection state and persists channel toggles. No model installation is performed.

The schema-3 messaging tables remain a durable globally serial server queue under schema 4. Player replies save immediately and outrank routine events. Model requests use only bounded gameplay/social context, never account credentials, and cannot modify combat. Transient transport, 408, 429 and server errors receive bounded retry backoff and can resume after restart. Invalid JSON, detected factual errors or repeated content receive one repair attempt before being discarded. Offline generation pauses while the game continues and queued jobs survive restart. Opening Phone or Messages does not create a generation job.

The previous explicitly configured SAR_GPT_OSS_URL service remains available for legacy deployments; leave it unset for direct local Ollama. That compatibility path uses its existing provider behavior.

## API routes

All account/world/social routes below use the session cookie. Client-supplied user IDs never select another account's universe. JSON responses set `Cache-Control: no-store`.

| Route | Behavior |
| --- | --- |
| `GET /api/status`, `GET /api/version` | Public health/build/server-time information. |
| `GET /api/bootstrap` | Authentication state, account revision, server time and configured inference availability. |
| `POST /api/auth/signup` | Create username/password account, issue session and once-only recovery code. |
| `POST /api/auth/login` | Authenticate and issue a persistent session. |
| `POST /api/auth/recover` | Rotate password/recovery code and revoke all old sessions. |
| `POST /api/auth/logout` | Revoke current session and expire its cookie. |
| `GET /api/account` | Account creation/status/revision/sync details. |
| `GET /api/world` | Authoritative persisted world and revision; finalize expired seasons. |
| `PUT /api/world` | Validate/save `{baseRevision, save}` transactionally. |
| `POST /api/world/import` | Migrate `{save}` into an empty account, preserving an original backup. |
| `GET /api/profile` | Player career, league/player seasons, preferences and selected loadout/operator. |
| `GET /api/bots/:botId` | Bot identity/Power/personality/Form/familiarity, career, weapon history and season records. |
| `GET /api/ai/status` | Local model connection state, saved preferences and queue status. |
| `PATCH /api/ai/preferences` | Save channel toggles, developer mode and temperature. |
| `POST /api/ai/test`, `POST /api/ai/lab` | Queue actual local model connection/personality tests; lab requires developer mode. |
| `GET /api/ai/jobs/:id` | Read this account’s job and validated generation. |
| `POST /api/ai/feedback` | Save GOOD/BAD/EDIT and preferred corrected JSON. |
| `GET /api/ai/export` | Export evaluated examples as JSONL without account credentials. |
| `GET /api/messages/thread/:botId?before=:messageId` | Full thread history,100newest-first rows per page, stable timestamp/ID cursor. |
| `GET /api/messages` | Latest 100 messages and configured inference status; trigger eligible queued generation. |
| `POST /api/messages/reply` | Persist `{botId, text}` and attempt its event-driven bot response. |
| `POST /api/messages/:messageId/read` | Mark this account's message read. |
| `DELETE /api/messages/:messageId` | Delete this account's message and scrub/cancel its reply context. |
| `GET /api/tournaments` | This universe's calendar, official schedule, custom records, earnings and authoritative server time. |
| `POST /api/tournaments` | Create an account-owned custom tournament and host draft team. |
| `GET /api/tournaments/:id` | Read this universe's roster, bracket, results and isolated participant stats. |
| `POST /api/tournaments/:id/team` | Register the authenticated user's draft team. |
| `POST /api/tournaments/:id/invite` | Invite a bot to the authenticated user's team; persist acceptance or decline. |
| `POST /api/tournaments/:id/start` | Fill available bot teams and start a complete valid bracket. |
| `POST /api/tournaments/:id/play` | Issue the current human-series game context. |
| `POST /api/tournaments/:id/result` | Idempotently record the issued tournament game and advance its bracket. |
| `POST /api/admin/tournaments` | Authenticated administrator creation with `X-SAR-Admin-Token`; participant IDs are validated transactionally. |
| `GET /api/launcher/update` | Public `server/releases/update.json`, or 204 when no release is published. |
| `GET /api/launcher/update.sig` | Public detached signature of the exact manifest bytes, or 204. |
| `GET /api/launcher/download/:filename` | Public installer download; only `.exe`/`.msi` basenames explicitly referenced by the published manifest and physically inside `server/releases` are served. |

Legacy admin tournament input remains `{name, startsAt, status, participants, bracket?, metadata?}`. `startsAt` is an epoch-millisecond timestamp. Allowed statuses are `ANNOUNCED`, `REGISTRATION`, `UPCOMING`, `ACTIVE`, `COMPLETED`; participants are unique existing bot IDs. Historical legacy records remain available.

Official LIVE CIRCUIT tournaments are scheduled from each persisted season start at 72-hour intervals before the season deadline. The background runtime advances registration and bot-only games without an open client, using actual projectiles and damage from the existing engine in a cloned isolated world. Eight teams of five play BO3 quarterfinals/semifinals and a BO5 final. Game records, participant stats, placements and earnings are separate from normal careers, Weapon Meta, familiarity and season combat. Individual official payouts are `[50000,35000,20000,12500,7500,5000,2500,1000]` for placements 1–8; custom payouts are zero. Persisted game IDs and payout identities prevent duplicate recording or payment. Calendar timestamps and countdowns use server-authoritative epochs; clients display local time.

## Database operations and future releases

SQLite uses foreign keys and WAL. Database schema 1 stores accounts, hashed sessions, worlds/backups, normalized career/weapon/season/patch data and version/migration records. Schema 2 adds messages, conversation summaries, structured events and legacy tournaments. Schema 3 adds local AI preferences, fifty social profiles, relationships, durable jobs, generation/training records and structured message fields. Schema 4 additively extends tournaments with kind/season/schedule identity and separate teams, registrations, series, games, participant stats, placements, earnings and invitations. Existing schema-1–3 data and game save schema 17 remain intact. All migrations are transactional. An older nonzero database schema receives a pre-migration database-file backup after a full WAL checkpoint. A database from a newer server schema is refused rather than reset.

For an online backup, use a proper SQLite online-backup operation or `VACUUM INTO` through a maintenance connection. Do not copy only the main `.sqlite` file while the service is actively writing in WAL mode. For a simple stopped-service backup, stop Node, checkpoint/close the database, and copy the database file. Preserve the backup separately from the release folder.

For an update: back up the durable database, install the complete server/game release, retain the same `SAR_DB_PATH` and environment, install dependencies using the new lockfile, then restart the service. Database migrations must remain additive and versioned. Keep the game save migration chain; do not edit numerical balance values without allowing the game to create and archive the corresponding fingerprinted balance patch. Existing patch/season archives are immutable once uploaded.

Publish signed launcher manifests/packages using the instructions in `launcher/`. The updater modifies installed application files, not this database. Keep the browser origin stable so PWA cache/local backups and the launcher refer to the same universe. Store private signing keys and inference/admin credentials outside every release ZIP.

## Verification

```powershell
npm run test:server
npm run test:live-circuit
```

The server integration tests use ephemeral ports, temporary databases and an isolated local GPT mock. They cover migration backups, preserved schema-16 progress, signup/login/restart/recovery/logout and simultaneous recovery-code rotation, cross-origin and universe isolation, revision conflicts, rejected regressions, normalized SQL, actual shipped-engine event/match reconciliation, server-controlled season rollover, immutable history, the shipped manual Meta archive/restart action and continued samples, message read/delete/cancellation, transactional admin events, inference retry/serialization and unchanged gameplay statistics. No production account, inference endpoint, or live database is required by these tests.
