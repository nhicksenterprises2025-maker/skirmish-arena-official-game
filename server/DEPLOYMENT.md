# Persistent game service

Version 1.15.0 adds human multiplayer to the existing account API and durable SQLite service. The desktop launcher retains its managed local runtime; the commands below are for development or service administration. Internet play requires a shared stable HTTPS origin, WebSocket forwarding and a persistent database volume. A hosted public endpoint has not yet been deployed or verified for this pass. Dialogue services remain removed; accounts, payments, persistence, bots and tournaments keep their existing systems.

No public production address is active. Paid Railway hosting was declined and its unused setup must not be deployed. Oracle was also rejected; alternatives and exact limits are recorded in [free-hosting preparation](../docs/FREE-HOSTING.md). Keep the existing working installation and its data until a suitable host, retained-account migration and launched-game connection are verified.

The browser game and Tauri launcher use the same game/API origin. A username retains its persistent account universe: 50 bots, retired records, career, seasons, patch archives and settings. SQLite is the canonical persisted copy. Human multiplayer runs the shipped simulation on the service and accepts gameplay intent only. Damage, kills, results, progression, rating and tournament advancement are resolved server-side. Private local practice remains client-side and stat-isolated.

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
| `SAR_BOT_OWNER_ID` | Production must name the migrated canonical account that owns the existing 50-bot roster. Shared multiplayer uses this one persistent roster and reservations rather than manufacturing bots for each incoming player. |
| `SAR_CLOUD_BOOTSTRAP_TOKEN` | Temporary server-only authorization for the single trusted original-account import. Keep it private and retire it after verification. |
| `SAR_STUN_URL` | Optional STUN URL for voice peer connectivity. |
| `SAR_TURN_URLS` | Comma-separated `turn:` / `turns:` URLs for voice relay. |
| `SAR_TURN_SECRET` | Server-only TURN shared secret. Authenticated clients receive expiring relay credentials, never this secret. |

Serve public traffic through HTTPS. Configure the reverse proxy to preserve the public `Host`, forward WebSocket upgrades at `/api/multiplayer/socket`, set trusted forwarded headers, and prevent direct public access to the internal Node port. Static files and API requests use the same origin and authenticated session. Write requests require JSON and reject foreign origins/cross-site browser requests. Keep one authoritative service process against its durable SQLite volume; do not scale independent simulation processes over the same active match database.

Casual TDM, casual Deathmatch, Ranked TDM and Ranked Deathmatch have separate queues. TDM parties may contain up to five humans; Deathmatch parties up to ten. Casual/custom/tournament filling uses eligible existing persistent bots without double-booking. Persisted match IDs, checkpoints and per-participant result receipts protect reconnect and repeat finalization. Opt-in WebRTC voice uses authorized party/team signaling; configure and test TURN for clients behind restrictive NATs. Local two-client voice tests do not prove public-network relay coverage.

The canonical owner's four client background slots coordinate with the server through six-second grants bound to the current connection, slot, match ID and exact bot roster. The client stops a whole slot before its acknowledged grant expires; stale snapshots cannot extend permission. New multiplayer allocations exclude live granted bots and wait when the real pool is insufficient. An already granted background match may drain through a future tournament reservation, while new assignments to those bots are denied; active tournament or multiplayer participation always takes precedence. Initial coordination waits at most six seconds. Disconnect, expiry and restart release client occupancy, so an absent owner does not block authoritative games. Private background simulation runs in the game client, not on the hosted service while that client is closed. Reopening must acquire current grants before those slots resume; offline practice and Custom remain stat-isolated.

Passwords and recovery codes use bcrypt at cost 12. The database stores salted hashes, not plaintext. Sessions use random tokens: only their SHA-256 hashes are stored. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. A session lasts 30 days; logout revokes that session. Recovery rotates the recovery code and revokes all earlier sessions. Keep database and environment backups private.

## Save consistency and seasons

Every stored world has an increasing revision and a server timestamp. `PUT /api/world` must name the revision it read. A stale revision returns HTTP 409 with `code: REVISION_CONFLICT`; a different invalid-save conflict uses `code: SAVE_REJECTED`. A rejected save does not change the cloud copy. These cases are deliberately distinct so the client can retain its pending checkpoint when validation fails.

The client hydrates its durable IndexedDB world/backup cache before loading gameplay. Large accepted worlds no longer depend on the small synchronous `localStorage` quota. Migration retains each legacy entry until its transaction commits; complete exports include retained durable branches. Replacement, import, logout and update checkpoints await a local commit before navigation. An unavailable durable store must preserve the prior authenticated branch and its original revision rather than presenting stale local totals as the latest cloud world. `npm run test:client` includes the quota/restart regression fixture.

The server checks fixed identities/Power/personality, nonnegative finite counters, immutable finalized seasons and patch archives, monotonic lifetime and weapon history, and career deltas against per-actor, Power-band, weapon and season measurements. Completed 5v5s must contribute ten career games and five wins/five losses, with compatible retained recent results. Original imported historical baselines are preserved; missing newer analytics remain unsampled.

The existing Meta archive/restart action remains available. It creates a new measured sample generation of the same balance fingerprint, retaining the entire previous sample as an immutable archive. Career, season and per-actor delta checks continue across that transition; restarting a sample cannot erase lifetime measurements.

The 15-day season deadline lives in the persisted database world. Bootstrap/world/profile reads advance expired seasons using server time and persist the transition. Both league and player season histories are retained. Clients cannot roll a season early or rewrite an existing deadline. The client uses server-anchored time while connected.

Legacy worlds remain preserved. New human results are append-only server receipts projected over each account's recoverable historical baseline. A client world upload cannot alter protected human XP, rating or career records after that baseline is established. Custom/practice results remain excluded. Competitive results and tournament advancement cannot be supplied by the client; the service finalizer validates actual persisted matches and participants.

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
| `GET /api/social/bootstrap`, `GET /api/social/search` | Authenticated Friends, privacy, party and public profile data; blocks and visibility rules apply. |
| `POST /api/social/friends/*`, `POST /api/social/party/*` | Friend requests/decisions and authorized persistent party actions. |
| `GET /api/social/chat`, `POST /api/social/chat` | Authorized party/match/team text rooms; Deathmatch has no team room. |
| `POST /api/social/mute`, `/block`, `/unblock`, `/report` | Separate text/voice moderation and server-enforced interaction blocks. |
| `GET /api/multiplayer/state`, `POST /api/multiplayer/action` | Authenticated match state and intent/queue controls; no client result authority. |
| `GET /api/multiplayer/voice-config` | Authenticated opt-in voice configuration and temporary TURN credentials. |
| `WSS /api/multiplayer/socket` | Authenticated intent, snapshots, control acknowledgements, social/chat and authorized voice signaling. |
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

Official SKIRMISH CHALLENGE TOURNAMENT events use the configured canonical bot-owner world for one shared calendar, bracket, history and authoritative participation pool. They retain their existing anchor and recur every three calendar days at 19:30 America/New_York, following daylight saving. Eight teams of five play every game in 3-game quarterfinals, 3-game semifinals and a 5-game final. Aggregate kills decide advancement, followed by total team damage; an exact damage tie waits for an explicit ruling. Each game retains its 50-kill target and five-minute limit. Check-in accepts players for 90 seconds inside two-minute preparation; roster locks and the existing countdown end at the fixed combat start. The corrected round endpoints are 19:53, 20:18 and 20:59. Custom dates and historical formats remain intact.

The background runtime uses actual projectiles and damage from the existing engine in a cloned isolated world. The local authority cannot run while Windows is off; missed events are cancelled without invented results or rewards. No-shows receive an eligible persistent-bot replacement for the rest of the event, with payout ownership transferred to that slot's replacement. Tournament reservations precede background allocation and conflicts never clone bots. Game records, participant stats, placements and earnings remain separate from normal careers, Weapon Meta, familiarity and season combat. Individual official payouts are `[50000,35000,20000,12500,7500,5000,2500,1000]` for placements 1–8; custom payouts are zero. Persisted game IDs and payout identities prevent duplicate recording or payment. Calendar timestamps, deadlines and countdowns use server-authoritative epochs; clients display local time and the schedule's Eastern timezone.

## Database operations and future releases

SQLite uses foreign keys and WAL. Historical migrations 1–8 are retained. Schema 9 retires message-only tables only after a verified, recoverable pre-migration SQLite snapshot. Schema 10 adds tournament cancellation support while preserving existing rows and constraints. Gameplay world data, identities, combat personalities, bot relationships, tournament invitations, account/payment records and normalized career/weapon/season/patch data remain. Tournament competition traits are copied unchanged into their dedicated table. A database from a newer schema is refused rather than reset. See [arena-refined-audit.md](../docs/arena-refined-audit.md) for retirement and recovery details.

Schema 12 adds separate human Friends, parties, privacy, chat/moderation, queues, match checkpoints, participation receipts and progression-baseline tables. Existing worlds, bot identities, tournament history and wallets remain intact. The usual verified pre-migration SQLite backup is retained. Human chat does not restore the retired bot conversation infrastructure.

Schema 13 adds persistent map-pool configuration without replacing those records. `SAR_MAP_POOLS` accepts an object with `revision`, optional `season`, and `pools`: nonempty arrays for `casual`, `ranked`, `tournament`, `ltm` and `custom`. Registered IDs are `brightfield-blocks`, `foundry-crossing` and `relay-fields`. Omitting the variable retains saved configuration or defaults to all three. Rotation removes no catalog/history entries. The LTM pool prepares configuration; it does not create a new mode.

Casual map votes close after six seconds before allocation. Tournament selections are persisted per game and never shift the existing schedule. Match/checkpoint records retain actual map/revision and meter calibration; compatible Balance 9.0 aggregates retain their reference calibration only when its physical scale matches the played map. Unknown or different scales remain separate. New maps use square 32-world-unit cells of 2 m²; these are unrelated to legacy weapon tuning units.

Permanent multiplayer modes are `tdm`, `deathmatch`, `gun-game`, `domination` and `hardpoint`. Casual queue IDs use the `casual-` prefix. Ranked admits only `ranked-tdm` and `ranked-deathmatch`; Custom accepts canonical permanent IDs. Existing TDM/Deathmatch rules and background-slot distribution are unchanged.

`mode-rules.js` owns new-mode rules revision `mode-expansion-1`. Gun Game derives its deterministic tiers from current registered weapons; deaths retain tiers, final-tier kills win, exact timeout leaders draw, and abandonment cannot win. Domination uses score 200, capture eight seconds with at most two accelerated capturers, one-second zone ticks and ten minutes. Hardpoint uses score 250, one-second uncontested ticks, sixty-second authored rotations and ten minutes. Objectives and tiers persist with authoritative match checkpoints/results.

`SAR_LTM_DEFINITIONS` accepts a JSON array, default empty. Each definition requires `id`, `name`, `description`, ISO `activeFrom`/`activeUntil`, registered `mapPool`, `teamSize`, `rules.baseMode`, current-weapon `allowedLoadouts` array and explicit boolean `xpEligible`/`statEligible`. Applicable bounded score/time/capture/tick/rotation rules are validated; irrelevant rules are rejected. Gun Game score is its tier progression, configurable through `killsPerTier`. Active definitions expose `ltm:<id>` casual queues; expiry/removal blocks fresh admission while saved games resume their immutable definition. No seasonal event is generated. LTM records retain their own identity and eligibility independently from permanent-mode statistics; they never award Ranked rating. Custom/practice remain excluded from all progression and careers. No database version change or balance archive reset is required for these additive JSON records.

For the initial hosted migration, `server/cloud-bootstrap.cjs` imports a validated trusted export into an empty account database through authenticated HTTPS `POST /api/admin/cloud-bootstrap`. It preserves existing accounts/password hashes, worlds, progression, careers, tournament records, ownership and wallets. A persisted receipt prevents duplicate import; an already populated deployment cannot be overwritten. Local login sessions and redundant backups are excluded from transfer, while their original local data remains retained. Players authenticate once at the new origin with their existing credentials, after which that origin builds its own cache. Never publish the private export or bootstrap authorization in Git, an installer or a public download.

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

## Competitive progression

Schema 14 adds Ranked season definitions/frozen records, reward claims and owned presentation selections. Migration retains existing AC ledger rows, orders, equipment, account worlds and progression, with the existing verified database backup. Reward credits use the immutable AC ledger under the configured commerce environment.

`SAR_RANKED_SEASONS` is a JSON array of `{id,label,startAt,endAt,reset}` with Unix millisecond boundaries. Non-overlapping immutable definitions support `{type:"carry"}`, `{type:"set",ratingUnits}` or `{type:"retain",numerator,denominator}`. Rating units are hundredths; a retain ratio is explicit and bounded between zero and one. With no configured seasons, existing world-season windows are displayed and rating carries forward. No placement quota or reset amount is introduced by default.

`SAR_RANKED_REWARDS` is a JSON array of `{id,name,type,rankIndex,seasonId?,claimAt?,payload}`. `rankIndex` addresses the existing zero-based 26-rank ladder. Types/payloads: `profile-icon` or `profile-banner` with an existing public image `asset`; `victory-pose` with an existing `pose`; `operator-appearance` with a registered `cosmeticId`; `weapon-mastery-badge` with a current `weapon`; `arena-credits` with explicit positive integer `units` (100 units = 1 Arena Credit, matching the existing wallet). Optional `claimAt` is a Unix millisecond time when redemption opens. Default array is empty. Definitions and already claimed grants cannot be silently changed.

Authenticated progression/leaderboard queries and reward claim/equip routes read authoritative Ranked receipts. Stable account/reward identities and transactional ownership prevent duplicate grants across retries, reconnects and restart. Custom/practice/official tournaments do not update Ranked; eligible unique records retain their existing Combined Stats policy. Offline inspection uses account-scoped cached presentation; claims require the service.

## Weapon mastery

Schema 15 adds a separate, additive mastery ledger with recoverable pre-migration backup. Keep it in the same durable account database; never replace it with client-supplied progress. `weapon-mastery.js` owns the versioned ten-level track, action weights, challenges and badge tiers. Resolved multiplayer results and trusted official scheduled games award once. Existing XP, rating, familiarity, careers and balance history remain unchanged.

`SAR_MASTERY_REWARDS` optionally supplies immutable cosmetic definitions. Empty configuration adds no rewards beyond the five earned tier badges. Only existing exported/public assets qualify; no mastery currency or gameplay buffs are supported. See [WEAPON-MASTERY.md](../docs/WEAPON-MASTERY.md) for types, eligibility and a configuration example. Claims and equipment require authenticated ownership; profile icon/banner presentation uses the latest explicit selection across Ranked and mastery.

## Factions

Schema 16 adds durable social membership, invitation/application, confirmation, privacy, report and activity tables through the existing verified-backup migration. Retain the same account database and origin. Trusted older exports can omit only newly introduced tables; schema 16 imports require complete Factions records. No faction data belongs in a client-authoritative world upload.

`server/factions.cjs` validates roles, normalized names/tags, current membership, blocked interactions and confirmation-bound ownership changes. `faction-identity.js` supplies the curated logo configuration shared by server and UI. There are no uploaded images, faction progression bonuses or currency grants. Reports enter a persisted review queue; this does not imply an automatic sanction service.

Activity uses unique eligible authoritative completion records at membership time. SQL aggregates retain original faction contribution snapshots after departure and provide bounded public leaderboard rows. Cached offline inspection is readonly; reconnect refreshes actual permissions. See [FACTIONS.md](../docs/FACTIONS.md) for admission, role, confirmation and moderation rules.


## Replay storage

Keep the selected SQLite database directory on persistent storage. Match recordings use its sibling `<database filename>.replays` directory, with authenticated metadata/access in schema 17. The installer contains code and assets only. Replay cleanup has its own byte/count limits, favorites and disk reserve; it never removes account/world data. See [replay maintenance](../docs/REPLAYS.md). Trusted account bootstrap explicitly leaves local recordings in their original database and private directory; account, reward and career history continue to migrate normally.
