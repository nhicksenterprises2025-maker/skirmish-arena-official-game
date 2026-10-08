# Persistent account server

LIVE CIRCUIT 1.6.0 ships the account API and SQLite database implementation. The desktop launcher includes and automatically starts the required local runtime; the commands below are for browser development or server administration. Internet cloud access requires deployment at a stable HTTPS origin with a persistent database volume. The release does not contain a hosted account service. ARENA REFINED Audit 1 removes dialogue services; accounts, payments, persistence and tournament simulation retain this shared backend.

The browser game and Tauri launcher use the same game/API origin. A username belongs to one persistent account universe: the 50 active bots, retained retired records, player career, seasons, patch archives, settings. SQLite is the canonical persisted copy. Normal browser combat runs in the client; official bot tournament games run the existing isolated simulation on the server. This is not a multiplayer or anti-cheat authority service.

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

## API routes

All account/world routes below use the session cookie. Client-supplied user IDs never select another account's universe. JSON responses set `Cache-Control: no-store`.

| Route | Behavior |
| --- | --- |
| `GET /api/status`, `GET /api/version` | Public health/build/server-time information. |
| `GET /api/bootstrap` | Authentication state, account revision, server time. |
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

Official SKIRMISH CHALLENGE TOURNAMENT events retain their existing anchor and recur every three calendar days at 19:30 America/New_York, following daylight saving. Eight teams of five play every game in 3-game quarterfinals, 3-game semifinals and a 5-game final. Aggregate kills decide advancement, followed by total team damage; an exact damage tie waits for an explicit ruling. Each game retains its 50-kill target and five-minute limit. Check-in accepts players for 90 seconds inside two-minute preparation; roster locks and the existing countdown end at the fixed combat start. The corrected round endpoints are 19:53, 20:18 and 20:59. Custom dates and historical formats remain intact.

The background runtime uses actual projectiles and damage from the existing engine in a cloned isolated world. The local authority cannot run while Windows is off; missed events are cancelled without invented results or rewards. No-shows receive an eligible persistent-bot replacement for the rest of the event, with payout ownership transferred to that slot's replacement. Tournament reservations precede background allocation and conflicts never clone bots. Game records, participant stats, placements and earnings remain separate from normal careers, Weapon Meta, familiarity and season combat. Individual official payouts are `[50000,35000,20000,12500,7500,5000,2500,1000]` for placements 1–8; custom payouts are zero. Persisted game IDs and payout identities prevent duplicate recording or payment. Calendar timestamps, deadlines and countdowns use server-authoritative epochs; clients display local time and the schedule's Eastern timezone.

## Database operations and future releases

SQLite uses foreign keys and WAL. Historical migrations 1–8 are retained. Schema 9 retires message-only tables only after a verified, recoverable pre-migration SQLite snapshot. Schema 10 adds tournament cancellation support while preserving existing rows and constraints. Gameplay world data, identities, combat personalities, bot relationships, tournament invitations, account/payment records and normalized career/weapon/season/patch data remain. Tournament competition traits are copied unchanged into their dedicated table. A database from a newer schema is refused rather than reset. See [arena-refined-audit.md](../docs/arena-refined-audit.md) for retirement and recovery details.

For an online backup, use a proper SQLite online-backup operation or `VACUUM INTO` through a maintenance connection. Do not copy only the main `.sqlite` file while the service is actively writing in WAL mode. For a simple stopped-service backup, stop Node, checkpoint/close the database, and copy the database file. Preserve the backup separately from the release folder.

For an update: back up the durable database, install the complete server/game release, retain the same `SAR_DB_PATH` and environment, install dependencies using the new lockfile, then restart the service. Database migrations must remain versioned and preserve recoverable originals; destructive retirement is limited to explicitly authorized message-only data. Keep the game save migration chain; do not edit numerical balance values without allowing the game to create and archive the corresponding fingerprinted balance patch. Existing patch/season archives are immutable once uploaded.

Publish signed launcher manifests/packages using the instructions in `launcher/`. The updater modifies installed application files, not this database. Keep the browser origin stable so PWA cache/local backups and the launcher refer to the same universe. Store private signing keys and payment/admin credentials outside every release ZIP.

## Verification

OVERCLOCK payment configuration, Sandbox boundaries and live-activation blockers are documented in [OVERCLOCK-PAYMENTS.md](../docs/OVERCLOCK-PAYMENTS.md). The shipped default is production commerce with money checkout disabled. Do not embed runtime payment secrets in the PC installer. Schema 6 adds the isolated AC ledger/ownership tables; schema 7 additively records payment orders, delivery and review events without changing the saved world or progression.

```powershell
npm run test:server
npm run test:live-circuit
```

The server integration tests use ephemeral ports and temporary databases. They cover authenticated account isolation, save/revision/history validation, schema-9 retirement backups and idempotence, preserved bot relationship/tournament behavior, payments and actual isolated simulation. No production account, external model or live database is required.
